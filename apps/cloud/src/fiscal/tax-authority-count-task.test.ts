import type { FiscalTaskDocumentType } from "@purosur/domain";
import {
  configureRegisterOfflinePointOfSale,
  configureRegisterPointOfSale,
  type LastAuthorizedAnswer,
  type TaxAuthorityLastAuthorizedLookup,
  type TaxAuthorityVoucherLookup,
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
import { insertAppliedOfflineDocument } from "./test-support/synced-offline-documents.js";

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
  readonly lookups: { pointOfSale: number; voucherType: number }[] = [];
  answer: LastAuthorizedAnswer = { kind: "read", number: 41 };

  async lastAuthorized({ pointOfSale, voucherType }: { pointOfSale: number; voucherType: number }) {
    this.lookups.push({ pointOfSale, voucherType });
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

const NO_VOUCHER: TaxAuthorityVoucherLookup = { voucherAt: async () => ({ kind: "none" }) };

function taskUnderTest(
  taxAuthority: TaxAuthorityLastAuthorizedLookup,
  vouchers: TaxAuthorityVoucherLookup = NO_VOUCHER,
) {
  const jobs = taxAuthorityCountJobs(
    {
      now: () => NOW,
      taxAuthority,
      vouchers,
      certificateFingerprint: FINGERPRINT,
    },
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

async function configureRegisterWithOfflinePointOfSale(
  enqueuedCounts: { pointOfSale: number; documentType: FiscalTaskDocumentType }[],
) {
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
      async (_transaction, pointOfSale, documentType) => {
        enqueuedCounts.push({ pointOfSale, documentType });
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

  it("reads the last authorized number of the payload's point of sale and keeps it with its day", async () => {
    await issueWsaaToken();
    const taxAuthority = new FakeLastAuthorizedLookup();
    const { task } = taskUnderTest(taxAuthority, {
      voucherAt: async () => ({
        kind: "found",
        voucher: {
          issuedOn: "2026-10-05",
          total: 12_500,
          documentType: 11,
          receiverDocumentType: 99,
          receiverDocumentNumber: 0,
          receiverTaxStatusCode: 5,
          authorizationCode: "71234567890123",
          authorizationCodeDueOn: "2026-10-15",
        },
      }),
    });
    const { helpers, borrowClient } = buildJobHelpers();

    await task({ pointOfSale: 7, documentType: "factura_c" }, helpers);

    expect(taxAuthority.lookups).toEqual([{ pointOfSale: 7, voucherType: 11 }]);
    expect(borrowClient).toHaveBeenCalledTimes(1);
    expect(await storedCounts()).toEqual([
      {
        pointOfSaleNumber: 7,
        documentType: "factura_c",
        lastAuthorized: 41,
        readAt: NOW,
        issuedOn: "2026-10-05",
      },
    ]);
  });

  it("fails when the cloud holds no valid WSAA token, so the worker retries it", async () => {
    const taxAuthority = new FakeLastAuthorizedLookup();
    const { task } = taskUnderTest(taxAuthority);

    await expect(
      task({ pointOfSale: 7, documentType: "factura_c" }, buildJobHelpers().helpers),
    ).rejects.toThrow();

    expect(taxAuthority.lookups).toEqual([]);
    expect(await storedCounts()).toEqual([]);
  });

  it("fails when the tax authority gives no answer, so the worker retries it", async () => {
    await issueWsaaToken();
    const taxAuthority = new FakeLastAuthorizedLookup();
    taxAuthority.answer = { kind: "no_answer" };
    const { task } = taskUnderTest(taxAuthority);

    await expect(
      task({ pointOfSale: 7, documentType: "factura_c" }, buildJobHelpers().helpers),
    ).rejects.toThrow();

    expect(await storedCounts()).toEqual([]);
  });

  it.each([
    {},
    { pointOfSale: "7", documentType: "factura_c" },
    { pointOfSale: 0, documentType: "factura_c" },
    { pointOfSale: 7 },
    { pointOfSale: 7, documentType: "nota_a" },
    null,
  ])(
    "fails a job whose payload names no point of sale or no known document type (%j), asking the tax authority nothing",
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
      const enqueuedCounts: { pointOfSale: number; documentType: FiscalTaskDocumentType }[] = [];
      const registerId = await configureRegisterWithOfflinePointOfSale(enqueuedCounts);
      expect(enqueuedCounts).toEqual([{ pointOfSale: 8, documentType: "factura_c" }]);
      expect(await storedCounts()).toEqual([]);
      expect(await testDatabase.db.select().from(offlineNumberBlocks)).toEqual([]);
      await issueWsaaToken();
      const taxAuthority = new FakeLastAuthorizedLookup();
      taxAuthority.answer = { kind: "read", number: 37 };
      const { task } = taskUnderTest(taxAuthority);

      await task({ pointOfSale: 8, documentType: "factura_c" }, buildJobHelpers().helpers);

      expect(await storedCounts()).toEqual([
        {
          pointOfSaleNumber: 8,
          documentType: "factura_c",
          lastAuthorized: 37,
          readAt: NOW,
          issuedOn: null,
        },
      ]);
      expect(await testDatabase.db.select().from(offlineNumberBlocks)).toMatchObject([
        { pointOfSaleNumber: 8, registerId, firstNumber: 38, lastNumber: 1037, assignedAt: NOW },
      ]);
    });

    it("starts right after the highest number synced when that is above the count read", async () => {
      const registerId = await configureRegisterWithOfflinePointOfSale([]);
      await insertAppliedOfflineDocument(testDatabase.db, registerId, {
        pointOfSale: 8,
        number: 60,
      });
      await issueWsaaToken();
      const taxAuthority = new FakeLastAuthorizedLookup();
      taxAuthority.answer = { kind: "read", number: 37 };
      const { task } = taskUnderTest(taxAuthority);

      await task({ pointOfSale: 8, documentType: "factura_c" }, buildJobHelpers().helpers);

      expect(await testDatabase.db.select().from(offlineNumberBlocks)).toMatchObject([
        { pointOfSaleNumber: 8, firstNumber: 61, lastNumber: 1060 },
      ]);
    });

    it("assigns no second block when the job runs again", async () => {
      await configureRegisterWithOfflinePointOfSale([]);
      await issueWsaaToken();
      const { task } = taskUnderTest(new FakeLastAuthorizedLookup());

      await task({ pointOfSale: 8, documentType: "factura_c" }, buildJobHelpers().helpers);
      await task({ pointOfSale: 8, documentType: "factura_c" }, buildJobHelpers().helpers);

      expect(await testDatabase.db.select().from(offlineNumberBlocks)).toHaveLength(1);
    });

    it("assigns no block when the count read is of a point of sale no register holds as its offline one", async () => {
      await configureRegisterWithOfflinePointOfSale([]);
      await issueWsaaToken();
      const { task } = taskUnderTest(new FakeLastAuthorizedLookup());

      await task({ pointOfSale: 7, documentType: "factura_c" }, buildJobHelpers().helpers);

      expect(await testDatabase.db.select().from(offlineNumberBlocks)).toEqual([]);
    });

    it("assigns no block when the count is not read", async () => {
      await configureRegisterWithOfflinePointOfSale([]);
      const { task } = taskUnderTest(new FakeLastAuthorizedLookup());

      await expect(
        task({ pointOfSale: 8, documentType: "factura_c" }, buildJobHelpers().helpers),
      ).rejects.toThrow();

      expect(await testDatabase.db.select().from(offlineNumberBlocks)).toEqual([]);
    });
  });

  describe("the count of the credit notes", () => {
    it("asks the tax authority for the last credit note C of the point of sale and keeps it beside the factura count", async () => {
      await issueWsaaToken();
      const taxAuthority = new FakeLastAuthorizedLookup();
      taxAuthority.answer = { kind: "read", number: 4 };
      const { task } = taskUnderTest(taxAuthority);
      await testDatabase.db.insert(taxAuthorityLastAuthorizedNumbers).values({
        pointOfSaleNumber: 7,
        documentType: "factura_c",
        lastAuthorized: 41,
        readAt: NOW,
      });

      await task({ pointOfSale: 7, documentType: "credit_note_c" }, buildJobHelpers().helpers);

      expect(taxAuthority.lookups).toEqual([{ pointOfSale: 7, voucherType: 13 }]);
      expect(await storedCounts()).toMatchObject([
        { pointOfSaleNumber: 7, documentType: "factura_c", lastAuthorized: 41 },
        { pointOfSaleNumber: 7, documentType: "credit_note_c", lastAuthorized: 4 },
      ]);
    });

    it("starts the first credit note block right after the last credit note ARCA authorized, whatever its last factura", async () => {
      const registerId = await configureRegisterWithOfflinePointOfSale([]);
      await issueWsaaToken();
      const taxAuthority = new FakeLastAuthorizedLookup();
      taxAuthority.answer = { kind: "read", number: 4 };
      const { task } = taskUnderTest(taxAuthority);

      await task({ pointOfSale: 8, documentType: "credit_note_c" }, buildJobHelpers().helpers);

      expect(await testDatabase.db.select().from(offlineNumberBlocks)).toMatchObject([
        {
          pointOfSaleNumber: 8,
          documentType: "credit_note_c",
          registerId,
          firstNumber: 5,
          lastNumber: 1004,
          assignedAt: NOW,
        },
      ]);
    });

    it("assigns no credit note block while only the factura count is read", async () => {
      await configureRegisterWithOfflinePointOfSale([]);
      await issueWsaaToken();
      const { task } = taskUnderTest(new FakeLastAuthorizedLookup());

      await task({ pointOfSale: 8, documentType: "factura_c" }, buildJobHelpers().helpers);

      expect(
        (await testDatabase.db.select().from(offlineNumberBlocks)).map(
          (block) => block.documentType,
        ),
      ).toEqual(["factura_c"]);
    });
  });
});
