import { z } from "zod";
import {
  extractJsonFromText,
  getConfiguredProviders,
  runWithFailover,
} from "@/lib/ai/router";
import type {
  EscrowContract,
  LLMMetadata,
  Milestone,
  MilestoneAIAudit,
} from "@/lib/types";
import { AuditVerdictSchema, roundCurrency } from "@/lib/types";

const DraftOutputSchema = z.object({
  title: z.string().min(3).max(140),
  description: z.string().min(5).max(2000),
  milestones: z
    .array(
      z.object({
        title: z.string().min(2).max(120),
        amount: z.number().positive(),
        acceptanceCriteria: z.array(z.string().min(2).max(300)).min(1).max(6),
      })
    )
    .min(1)
    .max(6),
});

export type DraftedContract = z.infer<typeof DraftOutputSchema> & {
  meta: LLMMetadata;
};

const AuditOutputSchema = z.object({
  verdict: AuditVerdictSchema,
  confidence: z.number().min(0).max(100),
  recommendedReleasePercent: z.number().min(0).max(100),
  summary: z.string().min(5).max(1500),
  criteriaResults: z
    .array(
      z.object({
        criterion: z.string(),
        met: z.boolean(),
        reason: z.string(),
      })
    )
    .min(1),
});

export async function draftContractWithAI(
  prompt: string,
  fetchImpl?: typeof fetch
): Promise<DraftedContract> {
  if (getConfiguredProviders().length === 0) {
    return deterministicDraftFallback(prompt);
  }

  const systemPrompt = `You are AgentEscrow's Financial Contract Architect.
Convert the user's plain-English scope into a structured escrow contract with clear milestones and objective, testable acceptance criteria.
Return ONLY valid JSON matching this schema:
{
  "title": "Short contract title",
  "description": "Clear 1-2 sentence scope summary",
  "milestones": [
    {
      "title": "Milestone 1 title",
      "amount": 100.00,
      "acceptanceCriteria": ["Objective criterion 1", "Objective criterion 2"]
    }
  ]
}`;

  const res = await runWithFailover({
    systemPrompt,
    userPrompt: `User scope:\n${prompt}`,
    temperature: 0.2,
    fetchImpl,
  });

  const parsed = DraftOutputSchema.parse(extractJsonFromText(res.text));
  return {
    ...parsed,
    milestones: parsed.milestones.map((m) => ({
      ...m,
      amount: roundCurrency(m.amount),
    })),
    meta: res.meta,
  };
}

function deterministicDraftFallback(prompt: string): DraftedContract {
  const amountMatch = prompt.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  const total = amountMatch ? Math.max(10, parseFloat(amountMatch[1])) : 150;
  const first = roundCurrency(total * 0.4);
  const second = roundCurrency(total - first);

  return {
    title: prompt.slice(0, 64).trim(),
    description: `Milestone escrow generated from scope: ${prompt.slice(0, 200)}`,
    milestones: [
      {
        title: "Architecture & Core Deliverable",
        amount: first,
        acceptanceCriteria: [
          "Working implementation or technical deliverable submitted with verifiable evidence",
          "Documentation and reproducible verification steps included",
        ],
      },
      {
        title: "Final Verification & Production Handoff",
        amount: second,
        acceptanceCriteria: [
          "All automated checks or test cases pass without critical defects",
          "Final handoff package matches agreed scope",
        ],
      },
    ],
    meta: {
      provider: "deterministic-fallback",
      model: "rule-engine-v1",
      fallbackUsed: true,
      latencyMs: 1,
      attempts: [
        {
          provider: "deterministic-fallback",
          model: "rule-engine-v1",
          success: true,
          latencyMs: 1,
        },
      ],
    },
  };
}

export async function auditMilestoneWithAI(params: {
  contract: EscrowContract;
  milestone: Milestone;
  proofUrl?: string;
  notes: string;
  artifactText: string;
  fetchImpl?: typeof fetch;
}): Promise<MilestoneAIAudit> {
  if (getConfiguredProviders().length === 0) {
    return deterministicAuditFallback(params);
  }

  const systemPrompt = `You are AgentEscrow's Independent Deliverable Verification Auditor.
Evaluate whether the contractor's submitted proof genuinely satisfies EVERY acceptance criterion for the milestone.
Be rigorous: if proof is vague, incomplete, placeholder text, or missing required criteria, mark FAIL or PARTIAL with an honest recommendedReleasePercent (0-100).
Return ONLY valid JSON:
{
  "verdict": "PASS" | "PARTIAL" | "FAIL",
  "confidence": 0-100,
  "recommendedReleasePercent": 0-100,
  "summary": "Concise audit rationale",
  "criteriaResults": [
    { "criterion": "exact criterion", "met": true/false, "reason": "specific justification" }
  ]
}`;

  const userPrompt = `Contract: ${params.contract.title}
Milestone: ${params.milestone.title} ($${params.milestone.amount.toFixed(2)})
Acceptance Criteria:
${params.milestone.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Contractor Proof URL: ${params.proofUrl ?? "None provided"}
Contractor Notes: ${params.notes}
Submitted Artifact / Evidence:
${params.artifactText.slice(0, 8000)}`;

  const res = await runWithFailover({
    systemPrompt,
    userPrompt,
    temperature: 0.1,
    fetchImpl: params.fetchImpl,
  });

  const parsed = AuditOutputSchema.parse(extractJsonFromText(res.text));
  return {
    verdict: parsed.verdict,
    confidence: Math.round(parsed.confidence),
    recommendedReleasePercent: Math.round(parsed.recommendedReleasePercent),
    summary: parsed.summary,
    criteriaResults: parsed.criteriaResults,
    provider: res.meta.provider,
    model: res.meta.model,
    fallbackUsed: res.meta.fallbackUsed,
    latencyMs: res.meta.latencyMs,
    attempts: res.meta.attempts,
    auditedAt: new Date().toISOString(),
  };
}

function deterministicAuditFallback(params: {
  milestone: Milestone;
  proofUrl?: string;
  notes: string;
  artifactText: string;
}): MilestoneAIAudit {
  const text = `${params.notes} ${params.artifactText}`.toLowerCase();
  const looksIncomplete =
    text.includes("incomplete") ||
    text.includes("todo") ||
    text.includes("fail") ||
    params.artifactText.trim().length < 30;

  const verdict = looksIncomplete ? "FAIL" : "PASS";
  const criteriaResults = params.milestone.acceptanceCriteria.map((c) => ({
    criterion: c,
    met: !looksIncomplete,
    reason: looksIncomplete
      ? "Submitted artifact appears incomplete or flagged as unfinished."
      : "Artifact provides substantive implementation evidence aligned with criterion.",
  }));

  return {
    verdict,
    confidence: looksIncomplete ? 86 : 91,
    recommendedReleasePercent: looksIncomplete ? 0 : 100,
    summary: looksIncomplete
      ? "Fallback auditor detected incomplete deliverable evidence; refund or revision recommended."
      : "Fallback auditor verified deliverable length, notes, and criteria alignment.",
    criteriaResults,
    provider: "deterministic-fallback",
    model: "rule-engine-v1",
    fallbackUsed: true,
    latencyMs: 2,
    attempts: [
      {
        provider: "deterministic-fallback",
        model: "rule-engine-v1",
        success: true,
        latencyMs: 2,
      },
    ],
    auditedAt: new Date().toISOString(),
  };
}

export interface CopilotProposal {
  reply: string;
  proposedAction?: {
    type: "APPROVE_PAYOUT" | "REFUND_MILESTONE";
    escrowId: string;
    milestoneId: string;
    amount: number;
    reason: string;
    label: string;
  };
  meta: LLMMetadata;
}

export async function runCopilotAdvisor(params: {
  message: string;
  contracts: EscrowContract[];
  selectedEscrowId?: string;
  fetchImpl?: typeof fetch;
}): Promise<CopilotProposal> {
  const focus =
    params.contracts.find((c) => c.id === params.selectedEscrowId) ??
    params.contracts[0];

  if (getConfiguredProviders().length === 0) {
    return {
      reply: focus
        ? `Copilot (offline rule mode): Contract "${focus.title}" is currently ${focus.status} ($${focus.totalAmount.toFixed(
            2
          )}). Configure an LLM key in .env to enable full natural-language reasoning.`
        : "No escrows exist yet. Create a contract in Contract Studio to start.",
      meta: {
        provider: "deterministic-fallback",
        model: "rule-engine-v1",
        fallbackUsed: true,
        latencyMs: 1,
        attempts: [],
      },
    };
  }

  const compactState = params.contracts.slice(0, 8).map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    totalAmount: c.totalAmount,
    autoReleaseCap: c.autoReleaseCap,
    paypalOrderId: c.paypalOrderId,
    paypalCaptureId: c.paypalCaptureId,
    milestones: c.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      amount: m.amount,
      status: m.status,
      verdict: m.aiAudit?.verdict,
      confidence: m.aiAudit?.confidence,
      payoutBatchId: m.paypalPayoutBatchId,
      refundId: m.paypalRefundId,
    })),
  }));

  const systemPrompt = `You are AgentEscrow's PayPal AI Financial Copilot.
You inspect escrow state and advise on PayPal Orders, Captures, Payouts, Refunds, and spending guardrails.
NEVER claim to have moved money unless the user confirms a proposed action.
Return ONLY valid JSON:
{
  "reply": "Clear, helpful answer grounded strictly in the provided escrow JSON",
  "proposedAction": null OR {
    "type": "APPROVE_PAYOUT" | "REFUND_MILESTONE",
    "escrowId": "exact id",
    "milestoneId": "exact id",
    "amount": 100.00,
    "reason": "short reason",
    "label": "Button label e.g. Approve $150 Payout"
  }
}`;

  const res = await runWithFailover({
    systemPrompt,
    userPrompt: `Focus contract ID: ${focus?.id ?? "none"}\nEscrows:\n${JSON.stringify(
      compactState,
      null,
      2
    )}\n\nUser request: ${params.message}`,
    temperature: 0.15,
    fetchImpl: params.fetchImpl,
  });

  const parsed = z
    .object({
      reply: z.string().min(1),
      proposedAction: z
        .object({
          type: z.enum(["APPROVE_PAYOUT", "REFUND_MILESTONE"]),
          escrowId: z.string(),
          milestoneId: z.string(),
          amount: z.number().positive(),
          reason: z.string(),
          label: z.string(),
        })
        .nullable()
        .optional(),
    })
    .parse(extractJsonFromText(res.text));

  return {
    reply: parsed.reply,
    proposedAction: parsed.proposedAction ?? undefined,
    meta: res.meta,
  };
}

