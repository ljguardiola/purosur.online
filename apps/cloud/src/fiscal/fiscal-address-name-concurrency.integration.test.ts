import { randomUUID } from "node:crypto";
import { createFiscalAddress } from "@purosur/domain/fiscal/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fiscalAddresses, users } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleFiscalAddressStore } from "./drizzle-fiscal-address-store.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let adminSql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("fiscal_address_name_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  adminSql = postgres(integrationDb.adminDatabaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await adminSql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("two fiscal addresses created at once under the same name on a real Postgres", () => {
  it("creates one of them and refuses the other as name_taken, whatever the letter case", async () => {
    const [actor] = await db
      .insert(users)
      .values({
        firstName: "Ada Lovelace",
        email: `ada-${randomUUID()}@example.com`,
        locationId: await seededLocationId(db),
      })
      .returning({ id: users.id });
    if (!actor) {
      throw new Error("test setup: seeding the actor returned no row");
    }
    const create = (name: string) => () =>
      createFiscalAddress(
        { store: new DrizzleFiscalAddressStore(db) },
        { name, streetAddress: "Calle Ficticia 123, CABA", actorId: actor.id },
      );

    // A SHARE lock lets both name checks read but parks both inserts, so the loser reaches the
    // database's unique index instead of the use case's own check.
    const outcomes = await runQueuedBehindHeldLock(
      adminSql,
      (holder) => holder.unsafe("lock table fiscal_addresses in share mode"),
      create("Deposito Central"),
      create("DEPOSITO CENTRAL"),
    );

    expect(outcomes.map(({ kind }) => kind).sort()).toEqual(["created", "name_taken"]);
    expect(await db.select().from(fiscalAddresses)).toHaveLength(1);
  });
});
