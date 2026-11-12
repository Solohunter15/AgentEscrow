import { NextRequest, NextResponse } from "next/server";
import { deleteDraftEscrow } from "@/lib/escrow/service";
import { apiErrorResponse } from "@/lib/http";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await deleteDraftEscrow(id);
    return NextResponse.json({ deleted: true, id });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

