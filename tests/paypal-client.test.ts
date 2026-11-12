import { describe, expect, it } from "vitest";
import { PayPalClient } from "@/lib/paypal/client";

describe("PayPalClient", () => {
  it("caches OAuth token and retries once on 401", async () => {
    let oauthCalls = 0;
    let orderCalls = 0;

    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/oauth2/token")) {
        oauthCalls += 1;
        return new Response(
          JSON.stringify({
            access_token: `tok_${oauthCalls}`,
            expires_in: 3600,
          }),
          { status: 200 }
        );
      }

      if (url.endsWith("/v2/checkout/orders")) {
        orderCalls += 1;
        if (orderCalls === 1) {
          return new Response(JSON.stringify({ message: "expired" }), {
            status: 401,
          });
        }
        return new Response(
          JSON.stringify({ id: "ORD-999", status: "CREATED" }),
          { status: 201 }
        );
      }

      throw new Error(`Unexpected URL ${url}`);
    };

    const client = new PayPalClient(
      {
        clientId: "cid",
        clientSecret: "sec",
        mode: "sandbox",
      },
      fetchMock
    );

    const order = await client.createOrder({
      escrowId: "esc_1",
      title: "Test Escrow",
      amount: 120,
    });

    expect(order.id).toBe("ORD-999");
    expect(oauthCalls).toBe(2);
    expect(orderCalls).toBe(2);
  });

  it("verifies webhook signatures via PayPal API when webhookId is set", async () => {
    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "tok", expires_in: 3600 }),
          { status: 200 }
        );
      }
      if (url.endsWith("/v1/notifications/verify-webhook-signature")) {
        return new Response(
          JSON.stringify({ verification_status: "SUCCESS" }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    const client = new PayPalClient(
      {
        clientId: "cid",
        clientSecret: "sec",
        mode: "sandbox",
        webhookId: "WH-ID-1",
      },
      fetchMock
    );

    const headers = new Headers({
      "paypal-transmission-id": "tid",
      "paypal-transmission-time": "2026-11-11T10:00:00Z",
      "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-transmission-sig": "sig",
    });

    const result = await client.verifyWebhookSignature({
      headers,
      webhookEvent: { id: "EVT-1" },
    });

    expect(result.verified).toBe(true);
  });
});

