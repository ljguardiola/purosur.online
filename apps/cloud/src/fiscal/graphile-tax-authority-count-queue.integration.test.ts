import { configureRegisterPointOfSale } from "@purosur/domain/fiscal/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  fiscalAddresses,
  registers,
  taxAuthorityLastAuthorizedNumbers,
  users,
} from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRegisterPointOfSaleStore } from "./drizzle-register-point-of-sale-store.js";
import {
  enqueueMissingTaxAuthorityCounts,
  enqueueTaxAuthorityCountJob,
} from "./graphile-tax-authority-count-queue.js";
import { TAX_AUTHORITY_COUNT_TASK_IDENTIFIER } from "./tax-authority-count-task.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("tax_authority_count_queue");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(async () => {
  await sql`delete from graphile_worker._private_jobs`;
  await sql`delete from tax_authority_last_authorized_numbers`;
});

async function pendingCountJobs(): Promise<
  { pointOfSale: number; attempts: number; maxAttempts: number }[]
> {
  const rows = await sql<
    { payload: { pointOfSale: number }; attempts: number; max_attempts: number }[]
  >`
    select j.payload, j.attempts, j.max_attempts
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${TAX_AUTHORITY_COUNT_TASK_IDENTIFIER}
    order by j.payload->>'pointOfSale'`;
  return rows.map((row) => ({
    pointOfSale: row.payload.pointOfSale,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
  }));
}

async function seedRegisters(count: number) {
  const locationId = await seededLocationId(db);
  const [actor] = await db
    .insert(users)
    .values({
      firstName: "Ada Lovelace",
      email: `ada-${crypto.randomUUID()}@example.com`,
      locationId,
    })
    .returning({ id: users.id });
  const [fiscalAddress] = await db
    .insert(fiscalAddresses)
    .values({ name: `Deposito ${crypto.randomUUID()}`, streetAddress: "Calle Ficticia 123, CABA" })
    .returning({ id: fiscalAddresses.id });
  const inserted = await db
    .insert(registers)
    .values(
      Array.from({ length: count }, () => ({ locationId, name: `Caja ${crypto.randomUUID()}` })),
    )
    .returning({ id: registers.id });
  if (!actor || !fiscalAddress) {
    throw new Error("test setup: seeding returned no row");
  }
  return {
    locationId,
    actorId: actor.id,
    fiscalAddressId: fiscalAddress.id,
    registerIds: inserted.map((row) => row.id),
  };
}

describe("the tax authority count jobs on a real Postgres", () => {
  it("enqueues the count of a point of sale in the transaction that configures it", async () => {
    const { locationId, actorId, fiscalAddressId, registerIds } = await seedRegisters(1);
    const store = new DrizzleRegisterPointOfSaleStore(
      db,
      () => NOW,
      undefined,
      enqueueTaxAuthorityCountJob,
    );

    const outcome = await configureRegisterPointOfSale(store, {
      locationId,
      registerId: registerIds[0] as string,
      pointOfSaleNumber: 21,
      fiscalAddressId,
      version: 0,
      actorId,
    });

    expect(outcome.kind).toBe("configured");
    expect(await pendingCountJobs()).toEqual([{ pointOfSale: 21, attempts: 0, maxAttempts: 25 }]);
  });

  it("enqueues nothing when the transaction that configures the point of sale rolls back", async () => {
    const { actorId, fiscalAddressId, registerIds } = await seedRegisters(1);
    const store = new DrizzleRegisterPointOfSaleStore(
      db,
      () => NOW,
      undefined,
      enqueueTaxAuthorityCountJob,
    );

    await expect(
      store.transaction(async (transaction) => {
        await transaction.recordRegisterPointOfSale({
          registerId: registerIds[0] as string,
          pointOfSaleNumber: 22,
          fiscalAddressId,
          version: 1,
          actorId,
        });
        throw new Error("the configuration failed after recording");
      }),
    ).rejects.toThrow("the configuration failed");

    expect(await pendingCountJobs()).toEqual([]);
  });

  it("keeps a single pending job per point of sale when it is configured again before the job runs", async () => {
    const { locationId, actorId, fiscalAddressId, registerIds } = await seedRegisters(1);
    const store = new DrizzleRegisterPointOfSaleStore(
      db,
      () => NOW,
      undefined,
      enqueueTaxAuthorityCountJob,
    );
    const registerId = registerIds[0] as string;
    await configureRegisterPointOfSale(store, {
      locationId,
      registerId,
      pointOfSaleNumber: 23,
      fiscalAddressId,
      version: 0,
      actorId,
    });

    await configureRegisterPointOfSale(store, {
      locationId,
      registerId,
      pointOfSaleNumber: 24,
      fiscalAddressId,
      version: 1,
      actorId,
    });
    await configureRegisterPointOfSale(store, {
      locationId,
      registerId,
      pointOfSaleNumber: 23,
      fiscalAddressId,
      version: 2,
      actorId,
    });

    expect((await pendingCountJobs()).map((job) => job.pointOfSale)).toEqual([23, 24]);
  });

  it("enqueues, at startup, the count of every claimed point of sale that has none yet", async () => {
    const { locationId, actorId, fiscalAddressId, registerIds } = await seedRegisters(2);
    const store = new DrizzleRegisterPointOfSaleStore(db, () => NOW);
    await configureRegisterPointOfSale(store, {
      locationId,
      registerId: registerIds[0] as string,
      pointOfSaleNumber: 31,
      fiscalAddressId,
      version: 0,
      actorId,
    });
    await configureRegisterPointOfSale(store, {
      locationId,
      registerId: registerIds[1] as string,
      pointOfSaleNumber: 32,
      fiscalAddressId,
      version: 0,
      actorId,
    });
    await db
      .insert(taxAuthorityLastAuthorizedNumbers)
      .values({ pointOfSaleNumber: 32, lastAuthorized: 5, readAt: NOW });

    await enqueueMissingTaxAuthorityCounts(db);
    await enqueueMissingTaxAuthorityCounts(db);

    expect((await pendingCountJobs()).map((job) => job.pointOfSale)).toEqual([31]);
  });
});
