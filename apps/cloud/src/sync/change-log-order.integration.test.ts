import { randomUUID } from "node:crypto";
import { asc } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changes } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { logChange } from "./change-log.js";

// PGlite runs every query over one connection, so two writers can never overlap there.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("change_log_order");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function branchSettingsChange(entityId: string) {
  return { entity: "branch_settings" as const, entityId, version: 2, op: "update" as const };
}

describe("two changes logged at once, on a real Postgres", () => {
  it("never lets a later change be read while an earlier one is still committing", async () => {
    const earlier = randomUUID();
    const later = randomUUID();
    let markEarlierLogged = () => {};
    const earlierIsLogged = new Promise<void>((resolve) => {
      markEarlierLogged = resolve;
    });
    let letEarlierCommit = () => {};
    const earlierMayCommit = new Promise<void>((resolve) => {
      letEarlierCommit = resolve;
    });
    const earlierWrite = db.transaction(async (tx) => {
      await logChange(tx, branchSettingsChange(earlier));
      markEarlierLogged();
      await earlierMayCommit;
    });
    await earlierIsLogged;

    const laterWrite = db.transaction((tx) => logChange(tx, branchSettingsChange(later)));
    try {
      await waitForLockWaiters(sql, 1);
      const visible = await db.select({ entityId: changes.entityId }).from(changes);
      expect(visible.map((row) => row.entityId)).not.toContain(later);
    } finally {
      letEarlierCommit();
      await Promise.allSettled([earlierWrite, laterWrite]);
    }

    const logged = await db
      .select({ entityId: changes.entityId })
      .from(changes)
      .orderBy(asc(changes.changeSeq));
    const order = logged.map((row) => row.entityId).filter((id) => id === earlier || id === later);
    expect(order).toEqual([earlier, later]);
  });
});
