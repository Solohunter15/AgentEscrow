import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
  checkRateLimit,
  clearRateLimitStoreForTests,
  isTrustedBrowserOrigin,
  sanitizeCsvCell,
} from "@/lib/security/rate-limit";
import {
  capturePayPalEscrowOrder,
  createEscrowContract,
  createPayPalEscrowOrder,
  deleteDraftEscrow,
} from "@/lib/escrow/service";
import { PayPalClient } from "@/lib/paypal/client";

describe("security & integrity controls", () => {
  let tempDir: string;

  beforeEach(async () => {
    clearRateLimitStoreForTests();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentescrow-sec-"));
    process.env.ESCROW_DB_PATH = path.join(tempDir, "escrow-db.json");
  });

  afterEach(async () => {
    delete process.env.ESCROW_DB_PATH;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("enforces sliding-window rate limits", () => {
    for (let i = 0; i < 3; i++) {
      const r = checkRateLimit({
        key: "ai:1.2.3.4",
        maxRequests: 3,
        windowMs: 60_000,
        nowMs: 1000 + i,
      });
      expect(r.allowed).toBe(true);
    }
    const blocked = checkRateLimit({
      key: "ai:1.2.3.4",
      maxRequests: 3,
      windowMs: 60_000,
      nowMs: 1010,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("blocks cross-origin CSRF requests while allowing same-origin", () => {
    expect(
      isTrustedBrowserOrigin(
        new Headers({
          host: "agentescrow.onrender.com",
          origin: "https://evil.attacker.com",
        })
      )
    ).toBe(false);

    expect(
      isTrustedBrowserOrigin(
        new Headers({
          host: "agentescrow.onrender.com",
          origin: "https://agentescrow.onrender.com",
        })
      )
    ).toBe(true);
  });

  it("neutralizes OWASP CSV formula injection payloads", () => {
    expect(sanitizeCsvCell("=CMD|'/C calc'!A0")).toBe("'=CMD|'/C calc'!A0");
    expect(sanitizeCsvCell("+SUM(A1:A2)")).toBe("'+SUM(A1:A2)");
    expect(sanitizeCsvCell("@IMPORTXML()")).toBe("'@IMPORTXML()");
    expect(sanitizeCsvCell("Normal Contract")).toBe("Normal Contract");
  });

  it("allows deleting DRAFT contracts but forbids deleting FUNDED contracts", async () => {
    const contract = await createEscrowContract({
      title: "Draft Escrow",
      description: "Removable draft",
      buyerEmail: "buyer@example.com",
      contractorEmail: "seller@example.com",
      autoReleaseCap: 50,
      milestones: [
        { title: "M1", amount: 50, acceptanceCriteria: ["Done"] },
      ],
    });
    await deleteDraftEscrow(contract.id);

    const funded = await createEscrowContract({
      title: "Funded Escrow",
      description: "Immutable funded agreement",
      buyerEmail: "buyer@example.com",
      contractorEmail: "seller@example.com",
      autoReleaseCap: 50,
      milestones: [
        { title: "M1", amount: 50, acceptanceCriteria: ["Done"] },
      ],
    });

    const mockPP = new PayPalClient(
      { clientId: "c", clientSecret: "s", mode: "sandbox" },
      async (url) => {
        const u = String(url);
        if (u.endsWith("/oauth2/token")) {
          return new Response(
            JSON.stringify({ access_token: "t", expires_in: 3600 }),
            { status: 200 }
          );
        }
        if (u.endsWith("/orders")) {
          return new Response(
            JSON.stringify({ id: "ORD-X", status: "CREATED" }),
            { status: 201 }
          );
        }
        return new Response(
          JSON.stringify({
            id: "ORD-X",
            status: "COMPLETED",
            purchase_units: [
              {
                payments: {
                  authorizations: [
                    {
                      id: "AUTH-X",
                      status: "CREATED",
                      amount: { currency_code: "USD", value: "50.00" },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 201 }
        );
      }
    );

    await createPayPalEscrowOrder(funded.id, mockPP);
    await capturePayPalEscrowOrder(funded.id, "ORD-X", mockPP);

    await expect(deleteDraftEscrow(funded.id)).rejects.toThrow("cannot be deleted");
  });
});

