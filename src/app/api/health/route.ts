import { NextResponse } from "next/server";
import { getPublicProviderSummary } from "@/lib/ai/router";
import { getPayPalConfig } from "@/lib/paypal/client";
import { readDatabase } from "@/lib/store/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const pp = getPayPalConfig();
  const providers = getPublicProviderSummary();
  const db = await readDatabase();

  const publicClientId =
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() || pp?.clientId || null;

  return NextResponse.json({
    ok: true,
    paypal: {
      configured: pp !== null,
      mode: pp?.mode ?? "sandbox",
      webhookVerificationEnabled: Boolean(pp?.webhookId),
      publicClientIdSet: Boolean(
        publicClientId && publicClientId !== "your_paypal_sandbox_client_id"
      ),
      publicClientId:
        publicClientId && publicClientId !== "your_paypal_sandbox_client_id"
          ? publicClientId
          : null,
    },
    aiProviders: providers,
    stats: {
      contracts: db.contracts.length,
      auditLogs: db.auditLogs.length,
      webhookEvents: db.webhookEvents.length,
    },
  });
}

