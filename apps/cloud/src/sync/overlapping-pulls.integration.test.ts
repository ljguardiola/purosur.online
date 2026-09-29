import { pullChanges } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deviceState } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { DrizzleChangeLog } from "./drizzle-change-log.js";

// PGlite runs every query over one connection, so two pulls can never overlap there.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("overlapping_pulls");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("two pulls of the same device overlapping, on a real Postgres", () => {
  it("answers the later one once the earlier one commits, instead of failing it", async () => {
    const { deviceId, locationId } = await insertEnrolledInstallation(db);
    const ports = { changeLog: new DrizzleChangeLog(db), clock: { now: () => new Date() } };
    await pullChanges(ports, { deviceId, locationId, since: 0 });

    let markEarlierRecorded = () => {};
    const earlierIsRecorded = new Promise<void>((resolve) => {
      markEarlierRecorded = resolve;
    });
    let letEarlierCommit = () => {};
    const earlierMayCommit = new Promise<void>((resolve) => {
      letEarlierCommit = resolve;
    });
    const earlier = db.transaction(async (tx) => {
      await tx
        .update(deviceState)
        .set({ lastPullSince: 1 })
        .where(eq(deviceState.deviceId, deviceId));
      markEarlierRecorded();
      await earlierMayCommit;
    });
    await earlierIsRecorded;

    const later = pullChanges(ports, { deviceId, locationId, since: 1 });
    try {
      await waitForLockWaiters(sql, 1);
    } finally {
      letEarlierCommit();
    }
    await earlier;

    await expect(later).resolves.toMatchObject({ cursor: 1, hasMore: false });
  });
});
