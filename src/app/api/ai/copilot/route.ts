import { NextRequest, NextResponse } from "next/server";
import { runCopilotAdvisor } from "@/lib/ai/escrow-ai";
import {
  approveMilestonePayout,
  refundMilestone,
} from "@/lib/escrow/service";
import { apiErrorResponse } from "@/lib/http";
import { appendAuditLog, readDatabase } from "@/lib/store/db";
import { CopilotRequestSchema } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CopilotRequestSchema.parse(body);

    if (parsed.confirmAction) {
      const { type, escrowId, milestoneId, amount, reason } =
        parsed.confirmAction;
      if (type === "APPROVE_PAYOUT") {
        const res = await approveMilestonePayout({ escrowId, milestoneId });
        const txId =
          res.milestone.paypalCaptureId ?? res.milestone.paypalPayoutBatchId;
        return NextResponse.json({
          executed: true,
          reply: `Released PayPal payment ${txId} ($${res.milestone.settledAmount.toFixed(
            2
          )}) for "${res.milestone.title}".`,
          contract: res.contract,
        });
      }
      const res = await refundMilestone({
        escrowId,
        milestoneId,
        amount,
        reason: reason || "Copilot-confirmed escrow refund",
      });
      return NextResponse.json({
        executed: true,
        reply: `Executed PayPal Refund ${res.milestone.paypalRefundId} ($${res.milestone.refundedAmount.toFixed(
          2
        )}) for milestone "${res.milestone.title}".`,
        contract: res.contract,
      });
    }

    const db = await readDatabase();
    const proposal = await runCopilotAdvisor({
      message: parsed.message,
      contracts: db.contracts,
      selectedEscrowId: parsed.escrowId,
    });

    await appendAuditLog({
      category: "AI_ROUTER",
      action: "COPILOT_QUERY",
      escrowId: parsed.escrowId,
      provider: proposal.meta.provider,
      model: proposal.meta.model,
      fallbackUsed: proposal.meta.fallbackUsed,
      details: `Copilot responded via ${proposal.meta.provider}/${proposal.meta.model}${
        proposal.proposedAction
          ? ` (proposed ${proposal.proposedAction.type})`
          : ""
      }.`,
    });

    return NextResponse.json({
      executed: false,
      reply: proposal.reply,
      proposedAction: proposal.proposedAction ?? null,
      meta: proposal.meta,
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

