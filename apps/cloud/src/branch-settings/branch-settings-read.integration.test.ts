import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { findBranchSettings } from "./branch-settings-read-route.js";

// PGlite runs every query over one connection, so a save can never commit between the read's own
// statements there. This runs the read against a real Postgres while a second connection commits a
// save in between them.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let adminSql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("branch_settings_read");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  // Only the schema's owner may LOCK TABLE; the read itself still runs as `cloud_app`.
  adminSql = postgres(integrationDb.adminDatabaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await adminSql.end({ timeout: 1 });
  await integrationDb.close();
});

async function waitForLockWaiter(): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const [row] = await adminSql<{ waiting: number }[]>`
      select count(*)::int as waiting from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'`;
    if ((row?.waiting ?? 0) >= 1) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("test setup: the read never queued behind the held lock");
}

describe("reading a branch's settings while a save commits, on a real Postgres through postgres-js", () => {
  it("answers the version and the hours from the same moment, never one from before the save and the other from after it", async () => {
    const locationId = await seededLocationId(db);
    expect(await findBranchSettings(db, locationId)).toMatchObject({ version: 1, hours: [] });

    // Holding branch_hours' lock lets the read take its settings row and then wait on the hours,
    // so the save below commits exactly between the read's two statements.
    const writer = await adminSql.reserve();
    let read: ReturnType<typeof findBranchSettings> | undefined;
    try {
      await writer`begin`;
      await writer`lock table branch_hours in access exclusive mode`;
      read = findBranchSettings(db, locationId);
      await waitForLockWaiter();
      await writer`update branch_settings set version = version + 1 where location_id = ${locationId}`;
      await writer`
        insert into branch_hours (location_id, day_of_week, position, opens_at, closes_at)
        values (${locationId}, 1, 0, '09:00', '13:00')`;
      await writer`commit`;
    } catch (error) {
      await writer`rollback`;
      throw error;
    } finally {
      writer.release();
    }

    expect(await read).toMatchObject({ version: 1, hours: [] });
    expect(await findBranchSettings(db, locationId)).toMatchObject({
      version: 2,
      hours: [{ dayOfWeek: 1, position: 0, opensAt: "09:00:00", closesAt: "13:00:00" }],
    });
  });
});
