import crypto from "crypto";

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  mode: "sandbox" | "live";
  webhookId?: string;
}

export class PayPalApiError extends Error {
  statusCode: number;
  details?: unknown;
  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function getPayPalConfig(): PayPalConfig | null {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret || clientId === "your_paypal_sandbox_client_id") {
    return null;
  }
  const mode = process.env.PAYPAL_MODE === "live" ? "live" : "sandbox";
  return {
    clientId,
    clientSecret,
    mode,
    webhookId: process.env.PAYPAL_WEBHOOK_ID?.trim() || undefined,
  };
}

export function isPayPalConfigured(): boolean {
  return getPayPalConfig() !== null;
}

export class PayPalClient {
  private readonly config: PayPalConfig;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private cachedToken: { token: string; expiresAtMs: number } | null = null;

  constructor(config?: PayPalConfig, fetchImpl: typeof fetch = fetch) {
    const resolved = config ?? getPayPalConfig();
    if (!resolved) {
      throw new PayPalApiError(
        "PayPal Sandbox credentials are not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
        503
      );
    }
    this.config = resolved;
    this.baseUrl =
      resolved.mode === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";
    this.fetchImpl = fetchImpl;
  }

  async getAccessToken(forceRefresh = false): Promise<string> {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.cachedToken &&
      now < this.cachedToken.expiresAtMs - 60_000
    ) {
      return this.cachedToken.token;
    }

    const auth = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString("base64");

    const res = await this.fetchImpl(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });

    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    };

    if (!res.ok || !data.access_token) {
      throw new PayPalApiError(
        data.error_description || `PayPal OAuth failed (${res.status})`,
        res.status || 502,
        data
      );
    }

    const expiresInSec = Number(data.expires_in ?? 32400);
    this.cachedToken = {
      token: data.access_token,
      expiresAtMs: now + expiresInSec * 1000,
    };
    return this.cachedToken.token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
    retriedAuth = false
  ): Promise<T> {
    const token = await this.getAccessToken(retriedAuth);
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...extraHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && !retriedAuth) {
      this.cachedToken = null;
      return this.request<T>(method, path, body, extraHeaders, true);
    }

    const data = (await res.json().catch(() => ({}))) as T & {
      message?: string;
      name?: string;
    };

    if (!res.ok) {
      throw new PayPalApiError(
        data?.message || `PayPal API ${method} ${path} failed (${res.status})`,
        res.status,
        data
      );
    }

    return data;
  }

  async createOrder(params: {
    escrowId: string;
    title: string;
    amount: number;
    currency?: string;
    intent?: "AUTHORIZE" | "CAPTURE";
  }) {
    const value = params.amount.toFixed(2);
    return this.request<{
      id: string;
      status: string;
      links?: Array<{ rel: string; href: string }>;
    }>(
      "POST",
      "/v2/checkout/orders",
      {
        intent: params.intent ?? "AUTHORIZE",
        purchase_units: [
          {
            reference_id: params.escrowId,
            custom_id: params.escrowId,
            description: `AgentEscrow: ${params.title}`.slice(0, 127),
            amount: {
              currency_code: params.currency ?? "USD",
              value,
            },
          },
        ],
      },
      {
        "PayPal-Request-Id": `order-${params.escrowId}-${crypto.randomUUID().slice(0, 8)}`,
      }
    );
  }

  async authorizeOrder(orderId: string) {
    return this.request<{
      id: string;
      status: string;
      purchase_units?: Array<{
        reference_id?: string;
        payments?: {
          authorizations?: Array<{
            id: string;
            status: string;
            amount?: { currency_code: string; value: string };
          }>;
        };
      }>;
    }>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {});
  }

  async captureAuthorization(params: {
    authorizationId: string;
    amount: number;
    currency?: string;
    finalCapture?: boolean;
    note?: string;
  }) {
    return this.request<{
      id: string;
      status: string;
      amount?: { currency_code: string; value: string };
    }>(
      "POST",
      `/v2/payments/authorizations/${encodeURIComponent(
        params.authorizationId
      )}/capture`,
      {
        amount: {
          value: params.amount.toFixed(2),
          currency_code: params.currency ?? "USD",
        },
        final_capture: params.finalCapture ?? false,
        note_to_payer: params.note?.slice(0, 255),
      }
    );
  }

  async voidAuthorization(authorizationId: string) {
    const token = await this.getAccessToken();
    const res = await this.fetchImpl(
      `${this.baseUrl}/v2/payments/authorizations/${encodeURIComponent(
        authorizationId
      )}/void`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
      }
    );
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}));
      throw new PayPalApiError(
        (data as { message?: string })?.message ||
          `PayPal Void failed (${res.status})`,
        res.status,
        data
      );
    }
    return { status: "VOIDED" };
  }

  async captureOrder(orderId: string) {
    return this.request<{
      id: string;
      status: string;
      purchase_units?: Array<{
        reference_id?: string;
        payments?: {
          captures?: Array<{
            id: string;
            status: string;
            amount?: { currency_code: string; value: string };
          }>;
        };
      }>;
    }>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {});
  }

  async getOrder(orderId: string) {
    return this.request<{
      id: string;
      status: string;
      purchase_units?: Array<{
        amount?: { currency_code: string; value: string };
      }>;
    }>("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  }

  async createPayout(params: {
    escrowId: string;
    milestoneId: string;
    recipientEmail: string;
    amount: number;
    currency?: string;
    note?: string;
  }) {
    const batchId = `ae_${params.escrowId.slice(0, 10)}_${params.milestoneId.slice(0, 10)}_${Date.now()}`;
    return this.request<{
      batch_header: {
        payout_batch_id: string;
        batch_status: string;
      };
    }>("POST", "/v1/payments/payouts", {
      sender_batch_header: {
        sender_batch_id: batchId,
        email_subject: "AgentEscrow Milestone Payout Released",
        email_message:
          params.note ??
          "Your milestone deliverable passed AI verification and funds have been released.",
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: {
            value: params.amount.toFixed(2),
            currency: params.currency ?? "USD",
          },
          note: (params.note ?? `Milestone ${params.milestoneId}`).slice(0, 4000),
          sender_item_id: `${params.milestoneId}-${Date.now()}`,
          receiver: params.recipientEmail,
        },
      ],
    });
  }

  async getPayoutBatch(payoutBatchId: string) {
    return this.request<{
      batch_header: {
        payout_batch_id: string;
        batch_status: string;
      };
    }>("GET", `/v1/payments/payouts/${encodeURIComponent(payoutBatchId)}`);
  }

  async refundCapture(params: {
    captureId: string;
    amount?: number;
    currency?: string;
    note?: string;
    idempotencyKey?: string;
  }) {
    const body: Record<string, unknown> = {};
    if (params.amount !== undefined) {
      body.amount = {
        value: params.amount.toFixed(2),
        currency_code: params.currency ?? "USD",
      };
    }
    if (params.note) {
      body.note_to_payer = params.note.slice(0, 255);
    }
    return this.request<{
      id: string;
      status: string;
      amount?: { currency_code: string; value: string };
    }>(
      "POST",
      `/v2/payments/captures/${encodeURIComponent(params.captureId)}/refund`,
      body,
      params.idempotencyKey
        ? { "PayPal-Request-Id": params.idempotencyKey }
        : undefined
    );
  }

  async verifyWebhookSignature(params: {
    headers: Headers;
    webhookEvent: unknown;
  }): Promise<{ verified: boolean; note: string }> {
    const webhookId = this.config.webhookId;
    if (!webhookId) {
      return {
        verified: false,
        note: "PAYPAL_WEBHOOK_ID not configured; stored as unverified sandbox telemetry",
      };
    }

    const transmissionId = params.headers.get("paypal-transmission-id");
    const transmissionTime = params.headers.get("paypal-transmission-time");
    const certUrl = params.headers.get("paypal-cert-url");
    const authAlgo = params.headers.get("paypal-auth-algo");
    const transmissionSig = params.headers.get("paypal-transmission-sig");

    if (
      !transmissionId ||
      !transmissionTime ||
      !certUrl ||
      !authAlgo ||
      !transmissionSig
    ) {
      return {
        verified: false,
        note: "Missing required PayPal transmission signature headers",
      };
    }

    const res = await this.request<{ verification_status: string }>(
      "POST",
      "/v1/notifications/verify-webhook-signature",
      {
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: params.webhookEvent,
      }
    );

    const verified = res.verification_status === "SUCCESS";
    return {
      verified,
      note: verified
        ? "Verified via PayPal verify-webhook-signature API"
        : `Signature verification returned ${res.verification_status}`,
    };
  }
}

let sharedClient: PayPalClient | null = null;
export function getSharedPayPalClient(): PayPalClient {
  if (!sharedClient) {
    sharedClient = new PayPalClient();
  }
  return sharedClient;
}

