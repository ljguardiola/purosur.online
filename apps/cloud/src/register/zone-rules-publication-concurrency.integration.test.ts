import { publishZoneRules } from "@purosur/domain/register/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zoneRules } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { DrizzleZoneRulesStore } from "./drizzle-zone-rules-store.js";

const RULES = {
  version: "2026a",
  transitions: [{ from: new Date("1970-01-01T00:00:00.000Z"), offsetMinutes: -180 }],
};

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let adminSql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("zone_rules_race");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  adminSql = postgres(integrationDb.adminDatabaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await adminSql.end({ timeout: 1 });
  await integrationDb.close();
});

// PGlite runs every query over one connection, so it can never race two starts of the cloud
// publishing the same version; this runs them over a real multi-connection postgres-js pool.
describe("two starts of the cloud publishing the same new zone rules at once on a real Postgres", () => {
  it("lets the second wait for the first and find the version already published", async () => {
    const store = new DrizzleZoneRulesStore(db);

    const outcomes = await runQueuedBehindHeldLock(
      adminSql,
      (holder) => holder`lock table zone_rules in share mode`,
      () => publishZoneRules({ store }, RULES),
      () => publishZoneRules({ store }, RULES),
    );

    expect(outcomes.map(({ kind }) => kind)).toEqual(["published", "already_published"]);
    expect(
      await db
        .select({ version: zoneRules.version, publicationNumber: zoneRules.publicationNumber })
        .from(zoneRules),
    ).toEqual([{ version: "2026a", publicationNumber: 1 }]);
  });
});
