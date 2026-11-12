import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
  appendAuditLog,
  hasWebhookEvent,
  mutateDatabase,
  readDatabase,
  recordWebhookEvent,
} from "@/lib/store/db";

describe("atomic json db", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentescrow-db-"));
    process.env.ESCROW_DB_PATH = path.join(tempDir, "escrow-db.json");
  });

  afterEach(async () => {
    delete process.env.ESCROW_DB_PATH;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("handles concurrent mutations without losing writes", async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, idx) =>
        appendAuditLog({
          category: "ESCROW",
          action: `EVENT_${idx}`,
          details: `Concurrent write ${idx}`,
        })
      )
    );

    const db = await readDatabase();
    expect(db.auditLogs).toHaveLength(12);
  });

  it("deduplicates webhook events by id", async () => {
    await recordWebhookEvent({
      id: "WH-123",
      eventType: "PAYMENT.CAPTURE.COMPLETED",
      resourceId: "CAP-1",
      verified: true,
      verificationNote: "ok",
      processedAt: new Date().toISOString(),
      summary: "Captured",
    });
    await recordWebhookEvent({
      id: "WH-123",
      eventType: "PAYMENT.CAPTURE.COMPLETED",
      resourceId: "CAP-1",
      verified: true,
      verificationNote: "ok",
      processedAt: new Date().toISOString(),
      summary: "Duplicate",
    });

    expect(await hasWebhookEvent("WH-123")).toBe(true);
    const db = await readDatabase();
    expect(db.webhookEvents).toHaveLength(1);
    await mutateDatabase((d) => {
      expect(d.webhookEvents[0].summary).toBe("Captured");
    });
  });
});

