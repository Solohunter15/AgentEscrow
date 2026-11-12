import { NextRequest, NextResponse } from "next/server";
import { submitAndAuditMilestone } from "@/lib/escrow/service";
import { apiErrorResponse } from "@/lib/http";
import { SubmitDeliverableSchema } from "@/lib/types";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const { id, milestoneId } = await context.params;
    const body = await req.json();
    const parsed = SubmitDeliverableSchema.parse(body);
    const result = await submitAndAuditMilestone({
      escrowId: id,
      milestoneId,
      proofUrl: parsed.proofUrl,
      notes: parsed.notes,
      artifactText: parsed.artifactText,
    });
    return NextResponse.json(result);
  } catch (err) {
    return apiErrorResponse(err);
  }
}

