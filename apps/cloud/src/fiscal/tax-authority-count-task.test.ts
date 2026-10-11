import {
  configureRegisterOfflinePointOfSale,
  configureRegisterPointOfSale,
  type LastAuthorizedAnswer,
  type TaxAuthorityLastAuthorizedLookup,
} from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  arcaWsaaTokens,
  fiscalAddresses,
  offlineNumberBlocks,
  registers,
  taxAuthorityLastAuthorizedNumbers,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRegisterOfflinePointOfSaleStore } from "./drizzle-register-offline-point-of-sale-store.js";
import { DrizzleRegisterPointOfSaleStore } from "./drizzle-register-point-of-sale-store.js";
import {
  TAX_AUTHORITY_COUNT_TASK_IDENTIFIER,
  taxAuthorityCountJobs,
} from "./tax-authority-count-task.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const FINGERPRINT = "AB:CD:EF";

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

class FakeLastAuthorizedLookup implements TaxAuthorityLastAuthorizedLookup {
  readonly lookups: number[] = [];
  answer: LastAuthorizedAnswer = { kind: "read", number: 41 };

  async lastAuthorized({ pointOfSale }: { pointOfSale: number }) {
    this.lookups.push(pointOfSale);
    return this.answer;
  }
}

async function issueWsaaToken() {
  await testDatabase.db.insert(arcaWsaaTokens).values({
    service: "wsfe",
    certificateFingerprint: FINGERPRINT,
    token: "FICTIONAL-TOKEN",
    sign: "FICTIONAL-SIGN",
    issuedAt: new Date(NOW.getTime() - 60_000),
    expiresAt: new Date(NOW.getTime() + 60 * 60_000),
  });
}

function taskUnderTest(taxAuthority: TaxAuthorityLastAuthorizedLookup) {
  const jobs = taxAuthorityCountJobs(
    { now: () => NOW, taxAuthority, certificateFingerprint: FINGERPRINT },
    { createDatabase: () => testDatabase.db },
  );
  const task = jobs.taskList[TAX_AUTHORITY_COUNT_TASK_IDENTIFIER];
  if (!task) {
    throw new Error("test setup: expected the registered count task");
  }
  return { jobs, task };
}

async function storedCounts() {
  return testDatabase.db.select().from(taxAuthorityLastAuthorizedNumbers);
}

async function configureRegisterWithOfflinePointOfSale(enqueuedCounts: number[]) {
  const locationId = await seededLocationId(testDatabase.db);
  const [actor] = await testDatabase.db
    .insert(users)
    .values({ firstName: "Ada Lucero", email: "ada@example.com", locationId })
    .returning({ id: users.id });
  const [register] = await testDatabase.db
    .insert(registers)
    .values({ locationId, name: "Caja 1" })
    .returning({ id: registers.id });
  const [fiscalAddress] = await testDatabase.db
    .insert(fiscalAddresses)
    .values({ name: "Deposito Central", streetAddress: "Calle Ficticia 123, CABA" })
    .returning({ id: fiscalAddresses.id });
  if (!actor || !register || !fiscalAddress) {
    throw new Error("test setup: seeding the register returned no row");
  }
  const base = { locationId, registerId: register.id, actorId: actor.id };
  await configureRegisterPointOfSale(
    new DrizzleRegisterPointOfSaleStore(testDatabase.db, () => NOW),
    { ...base, pointOfSaleNumber: 7, fiscalAddressId: fiscalAddress.id, version: 0 },
  );
  const outcome = await configureRegisterOfflinePointOfSale(
    new DrizzleRegisterOfflinePointOfSaleStore(
      testDatabase.db,
      () => NOW,
      undefined,
      async (_transaction, pointOfSale) => {
        enqueuedCounts.push(pointOfSale);
      },
    ),
    { ...base, pointOfSaleNumber: 8, version: 0 },
  );
  if (outcome.kind !== "configured") {
    throw new Error("test setup: the offline point of sale was not configured");
  }
  return register.id;
}

describe("taxAuthorityCountJobs", () => {
  it("registers the count task and schedules nothing, since it runs when a point of sale is configured", () => {
    const { jobs } = taskUnderTest(new FakeLastAuthorizedLookup());

    expect(jobs.crontab).toEqual([]);
  });

  it("reads the last authorized number of the payload's point of sale and keeps it", async () => {
    await issueWsaaToken();
    const taxAuthority = new FakeLastAuthorizedLookup();
    const { task } = taskUnderTest(taxAuthority);
    const { helpers, borrowClient } = buildJobHelpers();

    await task({ pointOfSale: 7 }, helpers);

    expect(taxAuthority.lookups).toEqual([7]);
    expect(borrowClient).toHaveBeenCalledTimes(1);
    expect(await storedCounts()).toEqual([
      { pointOfSaleNumber: 7, lastAuthorized: 41, readAt: NOW },
    ]);
  });

  it("fails when the cloud holds no valid WSAA token, so the worker retries it", async () => {
    const taxAuthority = new FakeLastAuthorizedLookup();
    const { task } = taskUnderTest(taxAuthority);

    await expect(task({ pointOfSale: 7 }, buildJobHelpers().helpers)).rejects.toThrow();

    expect(taxAuthority.lookups).toEqual([]);
    expect(await storedCounts()).toEqual([]);
  });

  it("fails when the tax authority gives no answer, so the worker retries it", async () => {
    await issueWsaaToken();
    const taxAuthority = new FakeLastAuthorizedLookup();
    taxAuthority.answer = { kind: "no_answer" };
    const { task } = taskUnderTest(taxAuthority);

    await expect(task({ pointOfSale: 7 }, buildJobHelpers().helpers)).rejects.toThrow();

    expect(await storedCounts()).toEqual([]);
  });

  it.each([{}, { pointOfSale: "7" }, { pointOfSale: 0 }, null])(
    "fails a job whose payload names no point of sale (%j), asking the tax authority nothing",
    async (payload) => {
      await issueWsaaToken();
      const taxAuthority = new FakeLastAuthorizedLookup();
      const { task } = taskUnderTest(taxAuthority);

      await expect(task(payload, buildJobHelpers().helpers)).rejects.toThrow();

      expect(taxAuthority.lookups).toEqual([]);
    },
  );

  describe("the offline number block that waits for the count", () => {
    it("starts right after the number ARCA last authorized, once the count of an offline point of sale configured with no count is read", async () => {
      const enqueuedCounts: number[] = [];
      const registerId = await configureRegisterWithOfflinePointOfSale(enqueuedCounts);
      expect(enqueuedCounts).toEqual([8]);
      expect(await storedCounts()).toEqual([]);
      expect(await testDatabase.db.select().from(offlineNumberBlocks)).toEqual([]);
      await issueWsaaToken();
      const taxAuthority = new FakeLastAuthorizedLookup();
      taxAuthority.answer = { kind: "read", number: 37 };
      const { task } = taskUnderTest(taxAuthority);

      await task({ pointOfSale: 8 }, buildJobHelpers().helpers);

      expect(await storedCounts()).toEqual([
        { pointOfSaleNumber: 8, lastAuthorized: 37, readAt: NOW },
      ]);
      expect(await testDatabase.db.select().from(offlineNumberBlocks)).toMatchObject([
        { pointOfSaleNumber: 8, registerId, firstNumber: 38, lastNumber: 1037, assignedAt: NOW },
      ]);
    });

    it("assigns no second block when the job runs again", async () => {
      await configureRegisterWithOfflinePointOfSale([]);
      await issueWsaaToken();
      const { task } = taskUnderTest(new FakeLastAuthorizedLookup());

      await task({ pointOfSale: 8 }, buildJobHelpers().helpers);
      await task({ pointOfSale: 8 }, buildJobHelpers().helpers);

      expect(await testDatabase.db.select().from(offlineNumberBlocks)).toHaveLength(1);
    });

    it("assigns no block when the count read is of a point of sale no register holds as its offline one", async () => {
      await configureRegisterWithOfflinePointOfSale([]);
      await issueWsaaToken();
      const { task } = taskUnderTest(new FakeLastAuthorizedLookup());

      await task({ pointOfSale: 7 }, buildJobHelpers().helpers);

      expect(await testDatabase.db.select().from(offlineNumberBlocks)).toEqual([]);
    });

    it("assigns no block when the count is not read", async () => {
      await configureRegisterWithOfflinePointOfSale([]);
      const { task } = taskUnderTest(new FakeLastAuthorizedLookup());

      await expect(task({ pointOfSale: 8 }, buildJobHelpers().helpers)).rejects.toThrow();

      expect(await testDatabase.db.select().from(offlineNumberBlocks)).toEqual([]);
    });
  });
});
