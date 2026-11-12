import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPayPalEscrowOrder } from "@/lib/escrow/service";
import { apiErrorResponse } from "@/lib/http";

const BodySchema = z.object({
  escrowId: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { escrowId } = BodySchema.parse(body);
    const order = await createPayPalEscrowOrder(escrowId);
    return NextResponse.json({ orderId: order.id, status: order.status });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

