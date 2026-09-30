import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { roles, userRoles, users } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { loadSampleData } from "./load-sample-data.js";
import { SAMPLE_CATEGORY_TREE } from "./sample-catalog.js";

const UNIQUE_VIOLATION = "23505";

// The load runs in one transaction, so where it takes the log lock can only be observed from other
// connections of a real Postgres.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("load_sample_data_change_log_order");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function seedActiveAdministrator(): Promise<void> {
  const [administratorRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  const [administrator] = await db
    .insert(users)
    .values({
      firstName: "Bootstrap Admin",
      email: `bootstrap-${randomUUID()}@example.com`,
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!administratorRole || !administrator) {
    throw new Error("test setup: the administrator was not seeded");
  }
  await db.insert(userRoles).values({ userId: administrator.id, roleId: administratorRole.id });
}

describe("loading the sample data while another writer holds the change log, on a real Postgres", () => {
  it("has already written every category when it starts waiting for the log", async () => {
    await seedActiveAdministrator();
    const lastTopCategory = SAMPLE_CATEGORY_TREE.at(-1);
    if (!lastTopCategory) {
      throw new Error("test setup: the sample category tree is empty");
    }

    const holder = await sql.reserve();
    await holder`begin`;
    await holder`select pg_advisory_xact_lock(hashtextextended('changes_log', 0))`;
    const load = loadSampleData(db, { now: () => new Date("2026-03-15T12:00:00.000Z") });
    let claimLastCategory: Promise<unknown> = Promise.resolve();
    try {
      await waitForLockWaiters(sql, 1);
      claimLastCategory = sql`
        insert into categories (name) values (${lastTopCategory.name})`.then(
        () => undefined,
        (error: { code?: string }) => error.code,
      );
      await waitForLockWaiters(sql, 2);
    } finally {
      await holder`rollback`;
      holder.release();
    }

    await expect(load).resolves.toMatchObject({ kind: "loaded" });
    await expect(claimLastCategory).resolves.toBe(UNIQUE_VIOLATION);
  }, 120_000);
});
