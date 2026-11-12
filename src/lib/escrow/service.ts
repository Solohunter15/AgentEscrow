import crypto from "crypto";
import { auditMilestoneWithAI } from "@/lib/ai/escrow-ai";
import { getSharedPayPalClient, PayPalClient } from "@/lib/paypal/client";
import {
  createAuditLog,
  hasWebhookEvent,
  mutateDatabase,
  recordWebhookEvent,
} from "@/lib/store/db";
import type { EscrowContract, EscrowStatus, Milestone } from "@/lib/types";
import { roundCurrency } from "@/lib/types";

export class EscrowDomainError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const inFlightMilestoneLocks = new Set<string>();

async function withMilestoneLock<T>(
  escrowId: string,
  milestoneId: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = `${escrowId}:${milestoneId}`;
  if (inFlightMilestoneLocks.has(key)) {
    throw new EscrowDomainError(
      "An operation is already in progress for this milestone. Please wait.",
      409
    );
  }
  inFlightMilestoneLocks.add(key);
  try {
    return await fn();
  } finally {
    inFlightMilestoneLocks.delete(key);
  }
}

export async function deleteDraftEscrow(escrowId: string): Promise<void> {
  await mutateDatabase((db) => {
    const idx = db.contracts.findIndex((c) => c.id === escrowId);
    if (idx === -1) {
      throw new EscrowDomainError("Escrow contract not found", 404);
    }
    const target = db.contracts[idx];
    if (isContractFunded(target) || target.status !== "DRAFT") {
      throw new EscrowDomainError(
        "Funded or active agreements cannot be deleted for audit integrity.",
        409
      );
    }
    db.contracts.splice(idx, 1);
    db.auditLogs.unshift(
      createAuditLog({
        category: "ESCROW",
        action: "DRAFT_DELETED",
        escrowId,
        details: `Removed unfunded draft agreement "${target.title}".`,
      })
    );
  });
}

function isContractFunded(contract: EscrowContract): boolean {
  return Boolean(contract.paypalAuthorizationId || contract.paypalCaptureId);
}

function recomputeContractStatus(contract: EscrowContract): EscrowStatus {
  if (!isContractFunded(contract)) return "DRAFT";
  const allSettledOrRefunded = contract.milestones.every(
    (m) =>
      m.status === "PAID_OUT" ||
      m.status === "REFUNDED" ||
      m.status === "PARTIAL_REFUND"
  );
  if (allSettledOrRefunded) {
    const anyPayout = contract.milestones.some((m) => m.settledAmount > 0);
    return anyPayout ? "COMPLETED" : "REFUNDED";
  }
  const anyStarted = contract.milestones.some(
    (m) => m.status !== "LOCKED_IN_ESCROW" && m.status !== "PENDING_FUNDING"
  );
  return anyStarted ? "IN_PROGRESS" : "FUNDED";
}

async function releaseMilestoneFunds(params: {
  contract: EscrowContract;
  milestone: Milestone;
  amount: number;
  note: string;
  paypalClient: PayPalClient;
}): Promise<{
  payoutBatchId: string | null;
  captureId: string | null;
  method: "AUTHORIZATION_CAPTURE" | "PAYOUT_BATCH";
}> {
  // Primary global rail: capture exact milestone amount from the held PayPal Authorization
  if (params.contract.paypalAuthorizationId) {
    const remainingOther = params.contract.milestones
      .filter((m) => m.id !== params.milestone.id)
      .reduce(
        (sum, m) =>
          sum + Math.max(0, m.amount - m.settledAmount - m.refundedAmount),
        0
      );
    const isFinal = remainingOther <= 0.01;
    const cap = await params.paypalClient.captureAuthorization({
      authorizationId: params.contract.paypalAuthorizationId,
      amount: params.amount,
      currency: params.contract.currency,
      finalCapture: isFinal,
      note: params.note,
    });
    return {
      payoutBatchId: null,
      captureId: cap.id,
      method: "AUTHORIZATION_CAPTURE",
    };
  }

  // Fallback for pre-captured orders: PayPal Payouts v1
  const payout = await params.paypalClient.createPayout({
    escrowId: params.contract.id,
    milestoneId: params.milestone.id,
    recipientEmail: params.contract.contractorEmail,
    amount: params.amount,
    currency: params.contract.currency,
    note: params.note,
  });
  return {
    payoutBatchId: payout.batch_header.payout_batch_id,
    captureId: null,
    method: "PAYOUT_BATCH",
  };
}

export async function createEscrowContract(input: {
  title: string;
  description: string;
  buyerEmail: string;
  contractorEmail: string;
  autoReleaseCap: number;
  milestones: Array<{
    title: string;
    amount: number;
    acceptanceCriteria: string[];
  }>;
}): Promise<EscrowContract> {
  const now = new Date().toISOString();
  const totalAmount = roundCurrency(
    input.milestones.reduce((sum, m) => sum + m.amount, 0)
  );
  if (totalAmount <= 0) {
    throw new EscrowDomainError("Total escrow amount must be positive");
  }

  const contract: EscrowContract = {
    id: `esc_${crypto.randomUUID().slice(0, 12)}`,
    title: input.title,
    description: input.description,
    buyerEmail: input.buyerEmail,
    contractorEmail: input.contractorEmail,
    currency: "USD",
    totalAmount,
    autoReleaseCap: roundCurrency(input.autoReleaseCap),
    status: "DRAFT",
    paypalOrderId: null,
    paypalAuthorizationId: null,
    paypalCaptureId: null,
    milestones: input.milestones.map((m) => ({
      id: `ms_${crypto.randomUUID().slice(0, 10)}`,
      title: m.title,
      amount: roundCurrency(m.amount),
      acceptanceCriteria: m.acceptanceCriteria,
      status: "PENDING_FUNDING",
      submission: null,
      aiAudit: null,
      paypalPayoutBatchId: null,
      paypalCaptureId: null,
      paypalRefundId: null,
      settledAmount: 0,
      refundedAmount: 0,
    })),
    createdAt: now,
    updatedAt: now,
  };

  await mutateDatabase((db) => {
    db.contracts.unshift(contract);
    db.auditLogs.unshift(
      createAuditLog({
        category: "ESCROW",
        action: "CONTRACT_CREATED",
        escrowId: contract.id,
        details: `Created "${contract.title}" ($${contract.totalAmount.toFixed(
          2
        )}) with ${contract.milestones.length} milestones; release limit $${contract.autoReleaseCap.toFixed(
          2
        )}.`,
      })
    );
  });

  return contract;
}

export async function createPayPalEscrowOrder(
  escrowId: string,
  paypalClient?: PayPalClient
) {
  const client = paypalClient ?? getSharedPayPalClient();
  const contract = await mutateDatabase(async (db) => {
    const found = db.contracts.find((c) => c.id === escrowId);
    if (!found) throw new EscrowDomainError("Escrow contract not found", 404);
    if (isContractFunded(found)) {
      throw new EscrowDomainError("Escrow is already funded", 409);
    }
    return found;
  });

  const order = await client.createOrder({
    escrowId: contract.id,
    title: contract.title,
    amount: contract.totalAmount,
    currency: contract.currency,
    intent: "AUTHORIZE",
  });

  await mutateDatabase((db) => {
    const found = db.contracts.find((c) => c.id === escrowId);
    if (found) {
      found.paypalOrderId = order.id;
      found.updatedAt = new Date().toISOString();
      db.auditLogs.unshift(
        createAuditLog({
          category: "PAYPAL",
          action: "ORDER_CREATED",
          escrowId: found.id,
          details: `Created PayPal Escrow Hold Order ${order.id} for $${found.totalAmount.toFixed(
            2
          )} USD.`,
        })
      );
    }
  });

  return order;
}

export async function capturePayPalEscrowOrder(
  escrowId: string,
  orderId: string,
  paypalClient?: PayPalClient
): Promise<EscrowContract> {
  const client = paypalClient ?? getSharedPayPalClient();
  const authResult = await client.authorizeOrder(orderId);
  const auth =
    authResult.purchase_units?.[0]?.payments?.authorizations?.[0];

  if (
    !auth ||
    (auth.status !== "CREATED" &&
      auth.status !== "CAPTURED" &&
      authResult.status !== "COMPLETED")
  ) {
    throw new EscrowDomainError(
      `PayPal authorization did not complete (status: ${
        auth?.status ?? authResult.status
      })`,
      400
    );
  }

  return mutateDatabase((db) => {
    const found = db.contracts.find((c) => c.id === escrowId);
    if (!found) throw new EscrowDomainError("Escrow contract not found", 404);
    if (found.paypalAuthorizationId === auth.id) return found;
    if (found.paypalOrderId && found.paypalOrderId !== orderId) {
      throw new EscrowDomainError(
        "Order ID does not match the contract's PayPal order",
        409
      );
    }

    const authorizedValue = auth.amount?.value
      ? parseFloat(auth.amount.value)
      : found.totalAmount;
    if (Math.abs(authorizedValue - found.totalAmount) > 0.01) {
      throw new EscrowDomainError(
        `Authorized amount ($${authorizedValue.toFixed(
          2
        )}) does not match contract total ($${found.totalAmount.toFixed(2)})`,
        400
      );
    }

    found.paypalOrderId = orderId;
    found.paypalAuthorizationId = auth.id;
    found.status = "FUNDED";
    found.updatedAt = new Date().toISOString();
    for (const ms of found.milestones) {
      if (ms.status === "PENDING_FUNDING") {
        ms.status = "LOCKED_IN_ESCROW";
      }
    }

    db.auditLogs.unshift(
      createAuditLog({
        category: "PAYPAL",
        action: "ESCROW_FUNDED",
        escrowId: found.id,
        details: `Authorized PayPal Hold ${auth.id} on Order ${orderId} ($${authorizedValue.toFixed(
          2
        )} USD). Milestones locked in escrow.`,
      })
    );

    return found;
  });
}

export async function submitAndAuditMilestone(params: {
  escrowId: string;
  milestoneId: string;
  proofUrl?: string;
  notes: string;
  artifactText: string;
  paypalClient?: PayPalClient;
  aiFetchImpl?: typeof fetch;
}): Promise<{
  contract: EscrowContract;
  milestone: Milestone;
  autoPaidOut: boolean;
}> {
  return withMilestoneLock(params.escrowId, params.milestoneId, async () => {
    const snapshot = await mutateDatabase((db) => {
      const contract = db.contracts.find((c) => c.id === params.escrowId);
      if (!contract) throw new EscrowDomainError("Escrow contract not found", 404);
      if (!isContractFunded(contract)) {
        throw new EscrowDomainError(
          "Escrow must be funded via PayPal before submitting milestones",
          400
        );
      }
      const milestone = contract.milestones.find(
        (m) => m.id === params.milestoneId
      );
      if (!milestone) throw new EscrowDomainError("Milestone not found", 404);
      if (
        milestone.status === "PAID_OUT" ||
        milestone.status === "REFUNDED" ||
        milestone.status === "PARTIAL_REFUND"
      ) {
        throw new EscrowDomainError(
          `Milestone is already finalized (${milestone.status})`,
          409
        );
      }

      milestone.submission = {
        proofUrl: params.proofUrl,
        notes: params.notes,
        artifactText: params.artifactText,
        submittedAt: new Date().toISOString(),
      };
      milestone.status = "SUBMITTED";
      contract.status = recomputeContractStatus(contract);
      contract.updatedAt = new Date().toISOString();
      return {
        contract: structuredClone(contract),
        milestone: structuredClone(milestone),
      };
    });

    const audit = await auditMilestoneWithAI({
      contract: snapshot.contract,
      milestone: snapshot.milestone,
      proofUrl: params.proofUrl,
      notes: params.notes,
      artifactText: params.artifactText,
      fetchImpl: params.aiFetchImpl,
    });

    const shouldAutoRelease =
      audit.verdict === "PASS" &&
      audit.confidence >= 80 &&
      snapshot.milestone.amount <= snapshot.contract.autoReleaseCap;

    let settlement: {
      payoutBatchId: string | null;
      captureId: string | null;
      method: string;
    } | null = null;
    let autoPaidOut = false;

    if (shouldAutoRelease) {
      const client = params.paypalClient ?? getSharedPayPalClient();
      settlement = await releaseMilestoneFunds({
        contract: snapshot.contract,
        milestone: snapshot.milestone,
        amount: snapshot.milestone.amount,
        note: `AgentEscrow verified release for "${snapshot.milestone.title}"`,
        paypalClient: client,
      });
      autoPaidOut = true;
    }

    return mutateDatabase((db) => {
      const contract = db.contracts.find((c) => c.id === params.escrowId);
      if (!contract) throw new EscrowDomainError("Escrow contract not found", 404);
      const milestone = contract.milestones.find(
        (m) => m.id === params.milestoneId
      );
      if (!milestone) throw new EscrowDomainError("Milestone not found", 404);

      milestone.aiAudit = audit;
      if (autoPaidOut && settlement) {
        milestone.paypalPayoutBatchId = settlement.payoutBatchId;
        milestone.paypalCaptureId = settlement.captureId;
        if (settlement.captureId && !contract.paypalCaptureId) {
          contract.paypalCaptureId = settlement.captureId;
        }
        milestone.settledAmount = milestone.amount;
        milestone.status = "PAID_OUT";
      } else {
        milestone.status = "AWAITING_APPROVAL";
      }
      contract.status = recomputeContractStatus(contract);
      contract.updatedAt = new Date().toISOString();

      const txRef =
        settlement?.captureId ?? settlement?.payoutBatchId ?? "pending";
      db.auditLogs.unshift(
        createAuditLog({
          category: "AI_ROUTER",
          action: "MILESTONE_AUDITED",
          escrowId: contract.id,
          milestoneId: milestone.id,
          provider: audit.provider,
          model: audit.model,
          fallbackUsed: audit.fallbackUsed,
          details: `Verdict ${audit.verdict} (${audit.confidence}% confidence) via ${audit.provider}/${audit.model}. ${
            autoPaidOut
              ? `Released $${milestone.amount.toFixed(2)} via PayPal (${txRef}).`
              : audit.verdict === "PASS"
              ? `Paused for review (above $${contract.autoReleaseCap.toFixed(2)} limit).`
              : "Paused for review or refund."
          }`,
        })
      );

      return { contract, milestone, autoPaidOut };
    });
  });
}

export async function approveMilestonePayout(params: {
  escrowId: string;
  milestoneId: string;
  paypalClient?: PayPalClient;
}): Promise<{ contract: EscrowContract; milestone: Milestone }> {
  return withMilestoneLock(params.escrowId, params.milestoneId, async () => {
    const snapshot = await mutateDatabase((db) => {
      const contract = db.contracts.find((c) => c.id === params.escrowId);
      if (!contract) throw new EscrowDomainError("Escrow contract not found", 404);
      if (!isContractFunded(contract)) {
        throw new EscrowDomainError("Escrow is not funded", 400);
      }
      const milestone = contract.milestones.find(
        (m) => m.id === params.milestoneId
      );
      if (!milestone) throw new EscrowDomainError("Milestone not found", 404);
      if (milestone.status === "PAID_OUT") {
        throw new EscrowDomainError("Milestone already paid out", 409);
      }
      if (milestone.status === "REFUNDED") {
        throw new EscrowDomainError("Milestone was already refunded", 409);
      }
      const remaining = roundCurrency(
        milestone.amount - milestone.settledAmount - milestone.refundedAmount
      );
      if (remaining <= 0) {
        throw new EscrowDomainError("No remaining balance on milestone", 400);
      }
      return {
        contract: structuredClone(contract),
        milestone: structuredClone(milestone),
        remaining,
      };
    });

    const client = params.paypalClient ?? getSharedPayPalClient();
    const settlement = await releaseMilestoneFunds({
      contract: snapshot.contract,
      milestone: snapshot.milestone,
      amount: snapshot.remaining,
      note: `AgentEscrow approved release for "${snapshot.milestone.title}"`,
      paypalClient: client,
    });

    return mutateDatabase((db) => {
      const contract = db.contracts.find((c) => c.id === params.escrowId)!;
      const milestone = contract.milestones.find(
        (m) => m.id === params.milestoneId
      )!;
      milestone.paypalPayoutBatchId = settlement.payoutBatchId;
      milestone.paypalCaptureId = settlement.captureId;
      if (settlement.captureId && !contract.paypalCaptureId) {
        contract.paypalCaptureId = settlement.captureId;
      }
      milestone.settledAmount = roundCurrency(
        milestone.settledAmount + snapshot.remaining
      );
      milestone.status = "PAID_OUT";
      contract.status = recomputeContractStatus(contract);
      contract.updatedAt = new Date().toISOString();

      const txRef = settlement.captureId ?? settlement.payoutBatchId;
      db.auditLogs.unshift(
        createAuditLog({
          category: "PAYPAL",
          action: "PAYMENT_RELEASED",
          escrowId: contract.id,
          milestoneId: milestone.id,
          details: `Approved & released $${snapshot.remaining.toFixed(
            2
          )} via PayPal (${txRef}).`,
        })
      );

      return { contract, milestone };
    });
  });
}

export async function refundMilestone(params: {
  escrowId: string;
  milestoneId: string;
  amount?: number;
  reason: string;
  paypalClient?: PayPalClient;
}): Promise<{ contract: EscrowContract; milestone: Milestone }> {
  return withMilestoneLock(params.escrowId, params.milestoneId, async () => {
    const snapshot = await mutateDatabase((db) => {
      const contract = db.contracts.find((c) => c.id === params.escrowId);
      if (!contract) throw new EscrowDomainError("Escrow contract not found", 404);
      if (!isContractFunded(contract)) {
        throw new EscrowDomainError("Escrow is not funded", 400);
      }
      const milestone = contract.milestones.find(
        (m) => m.id === params.milestoneId
      );
      if (!milestone) throw new EscrowDomainError("Milestone not found", 404);

      const refundable = roundCurrency(
        milestone.amount - milestone.settledAmount - milestone.refundedAmount
      );
      if (refundable <= 0) {
        throw new EscrowDomainError("No refundable balance left on milestone", 409);
      }
      const refundAmount = roundCurrency(params.amount ?? refundable);
      if (refundAmount <= 0 || refundAmount > refundable) {
        throw new EscrowDomainError(
          `Refund amount ($${refundAmount.toFixed(
            2
          )}) exceeds refundable balance ($${refundable.toFixed(2)})`,
          400
        );
      }

      return {
        contract: structuredClone(contract),
        milestone: structuredClone(milestone),
        refundAmount,
        refundable,
      };
    });

    const client = params.paypalClient ?? getSharedPayPalClient();
    const captureIdToRefund =
      snapshot.milestone.paypalCaptureId ?? snapshot.contract.paypalCaptureId;

    let refundOrVoidId: string;
    let actionLabel = "CAPTURE_REFUNDED";

    if (captureIdToRefund && snapshot.milestone.settledAmount > 0) {
      const refund = await client.refundCapture({
        captureId: captureIdToRefund,
        amount: snapshot.refundAmount,
        currency: snapshot.contract.currency,
        note: params.reason,
        idempotencyKey: `ref-${snapshot.milestone.id}-${Date.now()}`,
      });
      refundOrVoidId = refund.id;
    } else if (snapshot.contract.paypalAuthorizationId) {
      const otherOpen = snapshot.contract.milestones.some(
        (m) =>
          m.id !== snapshot.milestone.id &&
          m.amount - m.settledAmount - m.refundedAmount > 0.01
      );
      if (!otherOpen && snapshot.refundAmount >= snapshot.refundable - 0.01) {
        await client.voidAuthorization(snapshot.contract.paypalAuthorizationId);
        refundOrVoidId = `VOID_${snapshot.contract.paypalAuthorizationId}`;
        actionLabel = "HOLD_VOIDED";
      } else {
        refundOrVoidId = `RELEASE_${snapshot.contract.paypalAuthorizationId}`;
        actionLabel = "HOLD_RELEASED";
      }
    } else {
      throw new EscrowDomainError("No PayPal capture or authorization found", 400);
    }

    return mutateDatabase((db) => {
      const contract = db.contracts.find((c) => c.id === params.escrowId)!;
      const milestone = contract.milestones.find(
        (m) => m.id === params.milestoneId
      )!;
      milestone.paypalRefundId = refundOrVoidId;
      milestone.refundedAmount = roundCurrency(
        milestone.refundedAmount + snapshot.refundAmount
      );
      milestone.status =
        milestone.refundedAmount >= milestone.amount
          ? "REFUNDED"
          : "PARTIAL_REFUND";
      contract.status = recomputeContractStatus(contract);
      contract.updatedAt = new Date().toISOString();

      db.auditLogs.unshift(
        createAuditLog({
          category: "PAYPAL",
          action: actionLabel,
          escrowId: contract.id,
          milestoneId: milestone.id,
          details: `Returned $${snapshot.refundAmount.toFixed(
            2
          )} to buyer (${refundOrVoidId}). Reason: ${params.reason}`,
        })
      );

      return { contract, milestone };
    });
  });
}

export async function processPayPalWebhook(params: {
  headers: Headers;
  payload: {
    id?: string;
    event_type?: string;
    summary?: string;
    resource?: {
      id?: string;
      batch_header?: { payout_batch_id?: string; batch_status?: string };
      dispute_id?: string;
      reason?: string;
    };
  };
  paypalClient?: PayPalClient;
}): Promise<{ duplicate: boolean; verified: boolean; eventId: string }> {
  const eventId = params.payload.id || `wh_${crypto.randomUUID()}`;
  const eventType = params.payload.event_type || "UNKNOWN";

  if (await hasWebhookEvent(eventId)) {
    return { duplicate: true, verified: true, eventId };
  }

  let verified = false;
  let verificationNote = "PayPal client not configured for signature check";
  const webhookIdConfigured = Boolean(process.env.PAYPAL_WEBHOOK_ID?.trim());

  try {
    const client = params.paypalClient ?? getSharedPayPalClient();
    const check = await client.verifyWebhookSignature({
      headers: params.headers,
      webhookEvent: params.payload,
    });
    verified = check.verified;
    verificationNote = check.note;
  } catch (err: unknown) {
    verificationNote =
      err instanceof Error ? err.message : "Webhook verification skipped";
    if (webhookIdConfigured) {
      throw new EscrowDomainError(
        `Webhook signature verification failed: ${verificationNote}`,
        401
      );
    }
  }

  if (webhookIdConfigured && !verified) {
    await mutateDatabase((db) => {
      db.auditLogs.unshift(
        createAuditLog({
          category: "SECURITY",
          action: "WEBHOOK_SIGNATURE_REJECTED",
          details: `Rejected webhook ${eventId} (${eventType}): ${verificationNote}`,
        })
      );
    });
    throw new EscrowDomainError(
      `Invalid PayPal webhook signature: ${verificationNote}`,
      401
    );
  }

  const resourceId =
    params.payload.resource?.batch_header?.payout_batch_id ??
    params.payload.resource?.dispute_id ??
    params.payload.resource?.id ??
    "n/a";

  await recordWebhookEvent({
    id: eventId,
    eventType,
    resourceId,
    verified,
    verificationNote,
    processedAt: new Date().toISOString(),
    summary: params.payload.summary || eventType,
  });

  await mutateDatabase((db) => {
    if (verified && eventType === "CUSTOMER.DISPUTE.CREATED") {
      const matched = db.contracts.find(
        (c) =>
          c.paypalCaptureId &&
          JSON.stringify(params.payload.resource ?? {}).includes(c.paypalCaptureId)
      );
      if (matched) {
        matched.status = "DISPUTED";
        matched.updatedAt = new Date().toISOString();
      }
    }

    db.auditLogs.unshift(
      createAuditLog({
        category: "WEBHOOK",
        action: eventType,
        details: `Webhook ${eventId} (${eventType}) on resource ${resourceId} — ${verificationNote}`,
      })
    );
  });

  return { duplicate: false, verified, eventId };
}
