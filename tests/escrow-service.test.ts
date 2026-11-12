import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { PayPalClient } from "@/lib/paypal/client";
import {
  approveMilestonePayout,
  capturePayPalEscrowOrder,
  createEscrowContract,
  createPayPalEscrowOrder,
  processPayPalWebhook,
  refundMilestone,
  submitAndAuditMilestone,
} from "@/lib/escrow/service";

function makeMockPayPalClient(state: {
  payoutCalls: number;
  refundCalls: number;
  lastRefundAmount?: string;
}) {
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v1/oauth2/token")) {
      return new Response(
        JSON.stringify({ access_token: "mock-tok", expires_in: 3600 }),
        { status: 200 }
      );
    }
    if (url.endsWith("/v2/checkout/orders")) {
      return new Response(
        JSON.stringify({ id: "ORD-100", status: "CREATED" }),
        { status: 201 }
      );
    }
    if (url.endsWith("/v2/checkout/orders/ORD-100/capture")) {
      return new Response(
        JSON.stringify({
          id: "ORD-100",
          status: "COMPLETED",
          purchase_units: [
            {
              payments: {
                captures: [
                  {
                    id: "CAP-100",
                    status: "COMPLETED",
                    amount: { currency_code: "USD", value: "300.00" },
                  },
                ],
              },
            },
          ],
        }),
        { status: 201 }
      );
    }
    if (url.endsWith("/v1/payments/payouts")) {
      state.payoutCalls += 1;
      return new Response(
        JSON.stringify({
          batch_header: {
            payout_batch_id: `BATCH-${state.payoutCalls}`,
            batch_status: "PENDING",
          },
        }),
        { status: 201 }
      );
    }
    if (url.includes("/refund")) {
      state.refundCalls += 1;
      const body = JSON.parse(String(init?.body || "{}")) as {
        amount?: { value?: string };
      };
      state.lastRefundAmount = body.amount?.value;
      return new Response(
        JSON.stringify({
          id: `REF-${state.refundCalls}`,
          status: "COMPLETED",
        }),
        { status: 201 }
      );
    }
    throw new Error(`Unexpected PayPal URL: ${url}`);
  };

  return new PayPalClient(
    { clientId: "cid", clientSecret: "sec", mode: "sandbox" },
    fetchMock
  );
}

describe("escrow service & guardrails", () => {
  let tempDir: string;
  const origEnv = { ...process.env };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentescrow-svc-"));
    process.env.ESCROW_DB_PATH = path.join(tempDir, "escrow-db.json");
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(async () => {
    process.env = { ...origEnv };
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("enforces funding, auto-release cap, human approval, and guarded refunds", async () => {
    const ppState = { payoutCalls: 0, refundCalls: 0 };
    const ppClient = makeMockPayPalClient(ppState);

    const contract = await createEscrowContract({
      title: "Landing Page + Backend API",
      description: "Two-milestone build with $120 auto-release cap",
      buyerEmail: "buyer@example.com",
      contractorEmail: "seller@example.com",
      autoReleaseCap: 120,
      milestones: [
        {
          title: "Milestone 1 (Under Cap)",
          amount: 100,
          acceptanceCriteria: ["Working UI submitted"],
        },
        {
          title: "Milestone 2 (Over Cap)",
          amount: 200,
          acceptanceCriteria: ["Full backend API + tests"],
        },
      ],
    });

    // Cannot submit before PayPal Capture
    await expect(
      submitAndAuditMilestone({
        escrowId: contract.id,
        milestoneId: contract.milestones[0].id,
        notes: "Done",
        artifactText: "Implemented working UI components and verified output.",
        paypalClient: ppClient,
      })
    ).rejects.toThrow("funded");

    // Fund via PayPal Order + Capture
    const order = await createPayPalEscrowOrder(contract.id, ppClient);
    expect(order.id).toBe("ORD-100");
    await capturePayPalEscrowOrder(contract.id, "ORD-100", ppClient);

    // Milestone 1 ($100 <= $120 cap) passes -> auto-payout!
    const m1 = await submitAndAuditMilestone({
      escrowId: contract.id,
      milestoneId: contract.milestones[0].id,
      proofUrl: "https://github.com/example/repo/pull/1",
      notes: "Completed UI with unit tests",
      artifactText:
        "Implemented complete landing page with responsive layout, PayPal button, and verified tests.",
      paypalClient: ppClient,
    });
    expect(m1.autoPaidOut).toBe(true);
    expect(m1.milestone.status).toBe("PAID_OUT");
    expect(ppState.payoutCalls).toBe(1);

    // Milestone 2 ($200 > $120 cap) passes -> pauses for human sign-off!
    const m2 = await submitAndAuditMilestone({
      escrowId: contract.id,
      milestoneId: contract.milestones[1].id,
      notes: "Completed API",
      artifactText:
        "Implemented REST API endpoints, webhook handler, and automated test suite passing.",
      paypalClient: ppClient,
    });
    expect(m2.autoPaidOut).toBe(false);
    expect(m2.milestone.status).toBe("AWAITING_APPROVAL");
    expect(ppState.payoutCalls).toBe(1);

    // Partial refund ($50) on Milestone 2, then approve remaining $150
    const refunded = await refundMilestone({
      escrowId: contract.id,
      milestoneId: contract.milestones[1].id,
      amount: 50,
      reason: "Minor scope reduction agreed",
      paypalClient: ppClient,
    });
    expect(refunded.milestone.status).toBe("PARTIAL_REFUND");
    expect(ppState.refundCalls).toBe(1);

    const approved = await approveMilestonePayout({
      escrowId: contract.id,
      milestoneId: contract.milestones[1].id,
      paypalClient: ppClient,
    });
    expect(approved.milestone.status).toBe("PAID_OUT");
    expect(approved.milestone.settledAmount).toBe(150);
    expect(approved.contract.status).toBe("COMPLETED");
  });

  it("processes webhooks idempotently", async () => {
    const ppClient = makeMockPayPalClient({
      payoutCalls: 0,
      refundCalls: 0,
    });
    const first = await processPayPalWebhook({
      headers: new Headers(),
      payload: {
        id: "WH-EVT-99",
        event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS",
        summary: "Payout succeeded",
        resource: { batch_header: { payout_batch_id: "BATCH-1" } },
      },
      paypalClient: ppClient,
    });
    expect(first.duplicate).toBe(false);

    const second = await processPayPalWebhook({
      headers: new Headers(),
      payload: {
        id: "WH-EVT-99",
        event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS",
      },
      paypalClient: ppClient,
    });
    expect(second.duplicate).toBe(true);
  });

  it("rejects invalid webhook signatures when PAYPAL_WEBHOOK_ID is configured", async () => {
    process.env.PAYPAL_WEBHOOK_ID = "WH-ID-STRICT";
    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "tok", expires_in: 3600 }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({ verification_status: "FAILURE" }),
        { status: 200 }
      );
    };

    const strictClient = new PayPalClient(
      {
        clientId: "cid",
        clientSecret: "sec",
        mode: "sandbox",
        webhookId: "WH-ID-STRICT",
      },
      fetchMock
    );

    await expect(
      processPayPalWebhook({
        headers: new Headers({
          "paypal-transmission-id": "tid",
          "paypal-transmission-time": "2026-11-11T10:00:00Z",
          "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
          "paypal-auth-algo": "SHA256withRSA",
          "paypal-transmission-sig": "bad-sig",
        }),
        payload: {
          id: "WH-BAD-1",
          event_type: "CUSTOMER.DISPUTE.CREATED",
        },
        paypalClient: strictClient,
      })
    ).rejects.toThrow("Invalid PayPal webhook signature");
  });
});

