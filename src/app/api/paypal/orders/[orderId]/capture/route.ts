import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { capturePayPalEscrowOrder } from "@/lib/escrow/service";
import { apiErrorResponse } from "@/lib/http";

const BodySchema = z.object({
  escrowId: z.string().trim().min(1),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await context.params;
    const body = await req.json();
    const { escrowId } = BodySchema.parse(body);
    const contract = await capturePayPalEscrowOrder(escrowId, orderId);
    return NextResponse.json({ contract });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

