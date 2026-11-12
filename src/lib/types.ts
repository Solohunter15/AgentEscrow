import { z } from "zod";

export const EscrowStatusSchema = z.enum([
  "DRAFT",
  "FUNDED",
  "IN_PROGRESS",
  "COMPLETED",
  "DISPUTED",
  "REFUNDED",
]);
export type EscrowStatus = z.infer<typeof EscrowStatusSchema>;

export const MilestoneStatusSchema = z.enum([
  "PENDING_FUNDING",
  "LOCKED_IN_ESCROW",
  "SUBMITTED",
  "AWAITING_APPROVAL",
  "PAID_OUT",
  "PARTIAL_REFUND",
  "REFUNDED",
]);
export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;

export const AuditVerdictSchema = z.enum(["PASS", "PARTIAL", "FAIL"]);
export type AuditVerdict = z.infer<typeof AuditVerdictSchema>;

export interface LLMAttempt {
  provider: string;
  model: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  latencyMs: number;
}

export interface LLMMetadata {
  provider: string;
  model: string;
  fallbackUsed: boolean;
  latencyMs: number;
  attempts: LLMAttempt[];
}

export interface MilestoneSubmission {
  proofUrl?: string;
  notes: string;
  artifactText: string;
  submittedAt: string;
}

export interface CriterionResult {
  criterion: string;
  met: boolean;
  reason: string;
}

export interface MilestoneAIAudit {
  verdict: AuditVerdict;
  confidence: number;
  recommendedReleasePercent: number;
  summary: string;
  criteriaResults: CriterionResult[];
  provider: string;
  model: string;
  fallbackUsed: boolean;
  latencyMs: number;
  attempts: LLMAttempt[];
  auditedAt: string;
}

export interface Milestone {
  id: string;
  title: string;
  amount: number;
  acceptanceCriteria: string[];
  status: MilestoneStatus;
  submission: MilestoneSubmission | null;
  aiAudit: MilestoneAIAudit | null;
  paypalPayoutBatchId: string | null;
  paypalCaptureId: string | null;
  paypalRefundId: string | null;
  settledAmount: number;
  refundedAmount: number;
}

export interface EscrowContract {
  id: string;
  title: string;
  description: string;
  buyerEmail: string;
  contractorEmail: string;
  currency: "USD";
  totalAmount: number;
  autoReleaseCap: number;
  status: EscrowStatus;
  paypalOrderId: string | null;
  paypalAuthorizationId: string | null;
  paypalCaptureId: string | null;
  milestones: Milestone[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  category: "ESCROW" | "PAYPAL" | "AI_ROUTER" | "WEBHOOK" | "SECURITY";
  action: string;
  escrowId?: string;
  milestoneId?: string;
  provider?: string;
  model?: string;
  fallbackUsed?: boolean;
  details: string;
}

export interface WebhookEventRecord {
  id: string;
  eventType: string;
  resourceId: string;
  verified: boolean;
  verificationNote: string;
  processedAt: string;
  summary: string;
}

export interface EscrowDatabase {
  contracts: EscrowContract[];
  auditLogs: AuditLogEntry[];
  webhookEvents: WebhookEventRecord[];
}

export const SafeHttpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((val) => val.startsWith("https://") || val.startsWith("http://"), {
    message: "Only http(s) URLs are allowed",
  });

export const MilestoneInputSchema = z.object({
  title: z.string().trim().min(2).max(120),
  amount: z.number().positive().max(100000),
  acceptanceCriteria: z.array(z.string().trim().min(2).max(300)).min(1).max(10),
});

export const CreateEscrowRequestSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(5).max(2000),
  buyerEmail: z.string().trim().email(),
  contractorEmail: z.string().trim().email(),
  autoReleaseCap: z.number().min(0).max(100000),
  milestones: z.array(MilestoneInputSchema).min(1).max(10),
});

export const DraftFromPromptSchema = z.object({
  prompt: z.string().trim().min(10).max(3000),
  buyerEmail: z.string().trim().email().optional(),
  contractorEmail: z.string().trim().email().optional(),
  autoReleaseCap: z.number().min(0).max(100000).optional(),
});

export const SubmitDeliverableSchema = z.object({
  proofUrl: z
    .union([SafeHttpUrlSchema, z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  notes: z.string().trim().min(2).max(1500),
  artifactText: z.string().trim().min(10).max(15000),
});

export const RefundMilestoneSchema = z.object({
  amount: z.number().positive().max(100000).optional(),
  reason: z.string().trim().min(3).max(255),
});

export const CopilotRequestSchema = z.object({
  message: z.string().trim().min(2).max(2000),
  escrowId: z.string().trim().optional(),
  confirmAction: z
    .object({
      type: z.enum(["APPROVE_PAYOUT", "REFUND_MILESTONE"]),
      escrowId: z.string().trim().min(1),
      milestoneId: z.string().trim().min(1),
      amount: z.number().positive().optional(),
      reason: z.string().trim().optional(),
    })
    .optional(),
});

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

