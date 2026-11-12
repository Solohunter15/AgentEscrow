import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { EscrowDomainError } from "@/lib/escrow/service";
import { PayPalApiError } from "@/lib/paypal/client";

export function apiErrorResponse(err: unknown) {
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Invalid request payload",
        issues: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }
  if (err instanceof EscrowDomainError) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
  if (err instanceof PayPalApiError) {
    const safeStatus =
      err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 502;
    return NextResponse.json({ error: err.message }, { status: safeStatus });
  }
  const message =
    err instanceof Error ? err.message : "Unexpected internal server error";
  return NextResponse.json({ error: message }, { status: 500 });
}
