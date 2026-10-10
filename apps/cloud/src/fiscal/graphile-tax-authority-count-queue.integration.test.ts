import {
  configureRegisterOfflinePointOfSale,
  configureRegisterPointOfSale,
} from "@purosur/domain/fiscal/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fiscalAddresses,
  registers,
  taxAuthorityLastAuthorizedNumbers,
  users,
} from "../platform/db/schema.js";
import { DrizzleRegisterStore } from "../register/drizzle-register-store.js";
import { installationKeyCipher } from "../register/installation-key-cipher.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRegisterOfflinePointOfSaleStore } from "./drizzle-register-offline-point-of-sale-store.js";
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

beforeEach(async () => {
  integrationDb = await createIntegrationDatabase("tax_authority_count_queue");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterEach(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
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
      firstName: "Ada Lucero",
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
        await transaction.claimPointOfSale({
          pointOfSaleNumber: 22,
          registerId: registerIds[0] as string,
          mechanism: "real_time",
          actorId,
        });
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

  it("enqueues, at startup, the count of every claimed point of sale, real-time or offline, that has none yet", async () => {
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
    await configureRegisterOfflinePointOfSale(
      new DrizzleRegisterOfflinePointOfSaleStore(db, () => NOW),
      {
        locationId,
        registerId: registerIds[0] as string,
        pointOfSaleNumber: 33,
        version: 0,
        actorId,
      },
    );
    await db
      .insert(taxAuthorityLastAuthorizedNumbers)
      .values({ pointOfSaleNumber: 32, lastAuthorized: 5, readAt: NOW });

    await enqueueMissingTaxAuthorityCounts(db);
    await enqueueMissingTaxAuthorityCounts(db);

    expect((await pendingCountJobs()).map((job) => job.pointOfSale)).toEqual([31, 33]);
  });

  describe("when an offline point of sale is configured with no count held", () => {
    async function registerWithRealTimePointOfSale() {
      const seeded = await seedRegisters(1);
      const registerId = seeded.registerIds[0] as string;
      await configureRegisterPointOfSale(new DrizzleRegisterPointOfSaleStore(db, () => NOW), {
        locationId: seeded.locationId,
        registerId,
        pointOfSaleNumber: 41,
        fiscalAddressId: seeded.fiscalAddressId,
        version: 0,
        actorId: seeded.actorId,
      });
      return { ...seeded, registerId };
    }

    function offlineStore() {
      return new DrizzleRegisterOfflinePointOfSaleStore(
        db,
        () => NOW,
        undefined,
        enqueueTaxAuthorityCountJob,
      );
    }

    it("enqueues the count in the transaction that configures it", async () => {
      const { locationId, actorId, registerId } = await registerWithRealTimePointOfSale();

      const outcome = await configureRegisterOfflinePointOfSale(offlineStore(), {
        locationId,
        registerId,
        pointOfSaleNumber: 42,
        version: 0,
        actorId,
      });

      expect(outcome.kind).toBe("configured");
      expect(await pendingCountJobs()).toEqual([{ pointOfSale: 42, attempts: 0, maxAttempts: 25 }]);
    });

    it("enqueues nothing when the transaction rolls back", async () => {
      await registerWithRealTimePointOfSale();

      await expect(
        offlineStore().transaction(async (tx) => {
          await tx.requireTaxAuthorityCount(42);
          throw new Error("the configuration failed after asking for the count");
        }),
      ).rejects.toThrow("the configuration failed");

      expect(await pendingCountJobs()).toEqual([]);
    });
  });

  describe("when an installation enrolls", () => {
    async function configuredRegisterWithCount(pointOfSaleNumber: number) {
      const { locationId, actorId, fiscalAddressId, registerIds } = await seedRegisters(1);
      const registerId = registerIds[0] as string;
      await configureRegisterPointOfSale(new DrizzleRegisterPointOfSaleStore(db, () => NOW), {
        locationId,
        registerId,
        pointOfSaleNumber,
        fiscalAddressId,
        version: 0,
        actorId,
      });
      await db
        .insert(taxAuthorityLastAuthorizedNumbers)
        .values({ pointOfSaleNumber, lastAuthorized: 11, readAt: NOW });
      return registerId;
    }

    function enrollmentStore() {
      return new DrizzleRegisterStore(
        db,
        installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY),
        enqueueTaxAuthorityCountJob,
      );
    }

    it("forgets the count and enqueues its read in the same transaction", async () => {
      const registerId = await configuredRegisterWithCount(31);

      await enrollmentStore().transaction((tx) => tx.requireFreshTaxAuthorityCount(registerId));

      expect(await db.select().from(taxAuthorityLastAuthorizedNumbers)).toEqual([]);
      expect(await pendingCountJobs()).toEqual([{ pointOfSale: 31, attempts: 0, maxAttempts: 25 }]);
    });

    it("keeps the count and enqueues nothing when the enrollment rolls back", async () => {
      const registerId = await configuredRegisterWithCount(32);

      await expect(
        enrollmentStore().transaction(async (tx) => {
          await tx.requireFreshTaxAuthorityCount(registerId);
          throw new Error("the enrollment failed after requiring the count");
        }),
      ).rejects.toThrow("the enrollment failed");

      expect(await db.select().from(taxAuthorityLastAuthorizedNumbers)).toHaveLength(1);
      expect(await pendingCountJobs()).toEqual([]);
    });
  });
});
