import { NextRequest, NextResponse } from "next/server";
import { processPayPalWebhook } from "@/lib/escrow/service";
import { apiErrorResponse } from "@/lib/http";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const result = await processPayPalWebhook({
      headers: req.headers,
      payload,
    });
    return NextResponse.json({ received: true, ...result }, { status: 200 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

