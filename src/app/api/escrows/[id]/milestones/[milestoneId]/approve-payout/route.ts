import { NextRequest, NextResponse } from "next/server";
import { approveMilestonePayout } from "@/lib/escrow/service";
import { apiErrorResponse } from "@/lib/http";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const { id, milestoneId } = await context.params;
    const result = await approveMilestonePayout({
      escrowId: id,
      milestoneId,
    });
    return NextResponse.json(result);
  } catch (err) {
    return apiErrorResponse(err);
  }
}

