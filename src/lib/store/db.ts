import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import type {
  AuditLogEntry,
  EscrowContract,
  EscrowDatabase,
  WebhookEventRecord,
} from "@/lib/types";

const DEFAULT_DB: EscrowDatabase = {
  contracts: [],
  auditLogs: [],
  webhookEvents: [],
};

let writeQueue: Promise<unknown> = Promise.resolve();

export function getDbPath(): string {
  return process.env.ESCROW_DB_PATH
    ? path.resolve(process.env.ESCROW_DB_PATH)
    : path.resolve(process.cwd(), "data", "escrow-db.json");
}

async function readDbInternal(dbPath: string): Promise<EscrowDatabase> {
  try {
    const raw = await fs.readFile(dbPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<EscrowDatabase>;
    return {
      contracts: Array.isArray(parsed.contracts) ? parsed.contracts : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
      webhookEvents: Array.isArray(parsed.webhookEvents)
        ? parsed.webhookEvents
        : [],
    };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return structuredClone(DEFAULT_DB);
    }
    throw err;
  }
}

async function writeDbAtomic(dbPath: string, data: EscrowDatabase): Promise<void> {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  const tempPath = `${dbPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tempPath, dbPath);
}

export async function readDatabase(): Promise<EscrowDatabase> {
  const dbPath = getDbPath();
  return readDbInternal(dbPath);
}

export async function mutateDatabase<T>(
  mutator: (db: EscrowDatabase) => Promise<T> | T
): Promise<T> {
  const task = writeQueue.then(async () => {
    const dbPath = getDbPath();
    const db = await readDbInternal(dbPath);
    const result = await mutator(db);
    await writeDbAtomic(dbPath, db);
    return result;
  });
  writeQueue = task.catch(() => undefined);
  return task;
}

export function createAuditLog(
  entry: Omit<AuditLogEntry, "id" | "timestamp">
): AuditLogEntry {
  return {
    id: `aud_${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
}

export async function appendAuditLog(
  entry: Omit<AuditLogEntry, "id" | "timestamp">
): Promise<AuditLogEntry> {
  return mutateDatabase((db) => {
    const record = createAuditLog(entry);
    db.auditLogs.unshift(record);
    if (db.auditLogs.length > 500) {
      db.auditLogs.length = 500;
    }
    return record;
  });
}

export async function findContractById(
  id: string
): Promise<EscrowContract | undefined> {
  const db = await readDatabase();
  return db.contracts.find((c) => c.id === id);
}

export async function hasWebhookEvent(eventId: string): Promise<boolean> {
  const db = await readDatabase();
  return db.webhookEvents.some((ev) => ev.id === eventId);
}

export async function recordWebhookEvent(
  event: WebhookEventRecord
): Promise<void> {
  await mutateDatabase((db) => {
    if (!db.webhookEvents.some((ev) => ev.id === event.id)) {
      db.webhookEvents.unshift(event);
      if (db.webhookEvents.length > 300) {
        db.webhookEvents.length = 300;
      }
    }
  });
}

