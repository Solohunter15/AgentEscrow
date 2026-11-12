import { NextRequest, NextResponse } from "next/server";
import { refundMilestone } from "@/lib/escrow/service";
import { apiErrorResponse } from "@/lib/http";
import { RefundMilestoneSchema } from "@/lib/types";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const { id, milestoneId } = await context.params;
    const body = await req.json();
    const parsed = RefundMilestoneSchema.parse(body);
    const result = await refundMilestone({
      escrowId: id,
      milestoneId,
      amount: parsed.amount,
      reason: parsed.reason,
    });
    return NextResponse.json(result);
  } catch (err) {
    return apiErrorResponse(err);
  }
}

