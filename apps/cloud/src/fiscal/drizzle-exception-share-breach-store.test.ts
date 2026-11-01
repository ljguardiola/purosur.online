import { recordExceptionShareBreaches } from "@purosur/domain/fiscal/use-cases";
import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { exceptionShareBreaches } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { DrizzleExceptionShareBreachStore } from "./drizzle-exception-share-breach-store.js";
import {
  insertFiscalAddress,
  insertRegisterAtFiscalAddress,
} from "./test-support/exception-share-fixtures.js";
import {
  insertCaeaDocument,
  insertOnlineCreditNote,
  insertReceiptRequest,
} from "./test-support/issued-document-fixtures.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const LATER = new Date("2026-10-08T15:00:00.000Z");
const WINDOW = { from: "2025-01", through: "2026-09" };

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

function lockedCounts(window = WINDOW) {
  return new DrizzleExceptionShareBreachStore(db, () => NOW).transaction((transaction) =>
    transaction.lockMonthlyVoucherCounts(window),
  );
}

async function anAddressWithRegister(name = "Depósito Central") {
  const fiscalAddressId = await insertFiscalAddress(db, name);
  const registerId = await insertRegisterAtFiscalAddress(db, fiscalAddressId, `Caja de ${name}`);
  return { fiscalAddressId, registerId };
}

describe("DrizzleExceptionShareBreachStore.lockMonthlyVoucherCounts", () => {
  it("counts every authorized voucher of the month and the ones authorized under an offline code as exceptions", async () => {
    const { fiscalAddressId, registerId } = await anAddressWithRegister();
    await insertReceiptRequest(db, registerId, { issuedOn: "2026-09-10" });
    await insertOnlineCreditNote(db, registerId, { issuedOn: "2026-09-11" });
    await insertCaeaDocument(db, registerId, { issuedOn: "2026-09-12" });
    await insertCaeaDocument(db, registerId, {
      issuedOn: "2026-09-13",
      documentType: "credit_note_c",
    });

    expect(await lockedCounts()).toEqual([
      { fiscalAddressId, month: "2026-09", exceptionCount: 2, totalCount: 4 },
    ]);
  });

  it("leaves out the vouchers still waiting for their authorization", async () => {
    const { registerId } = await anAddressWithRegister();
    await insertReceiptRequest(db, registerId, { issuedOn: "2026-09-10" });
    await insertReceiptRequest(db, registerId, {
      issuedOn: "2026-09-10",
      answerKind: null,
      authorizationCode: null,
      authorizationCodeDueOn: null,
      answeredAt: null,
    });

    expect(await lockedCounts()).toMatchObject([{ exceptionCount: 0, totalCount: 1 }]);
  });

  it("adds up the registers of one fiscal address and keeps another address apart", async () => {
    const central = await anAddressWithRegister("Depósito Central");
    const secondRegister = await insertRegisterAtFiscalAddress(
      db,
      central.fiscalAddressId,
      "Caja 2",
    );
    const north = await anAddressWithRegister("Local Norte");
    await insertReceiptRequest(db, central.registerId, { issuedOn: "2026-09-10" });
    await insertCaeaDocument(db, secondRegister, { issuedOn: "2026-09-10" });
    await insertReceiptRequest(db, north.registerId, { issuedOn: "2026-09-10" });

    const counts = await lockedCounts();

    expect(counts).toHaveLength(2);
    expect(counts).toContainEqual({
      fiscalAddressId: central.fiscalAddressId,
      month: "2026-09",
      exceptionCount: 1,
      totalCount: 2,
    });
    expect(counts).toContainEqual({
      fiscalAddressId: north.fiscalAddressId,
      month: "2026-09",
      exceptionCount: 0,
      totalCount: 1,
    });
  });

  it("puts a voucher in the month of its issue day, on the first and the last day alike", async () => {
    const { fiscalAddressId, registerId } = await anAddressWithRegister();
    await insertReceiptRequest(db, registerId, { issuedOn: "2026-08-31" });
    await insertReceiptRequest(db, registerId, { issuedOn: "2026-09-01" });
    await insertReceiptRequest(db, registerId, { issuedOn: "2026-09-30" });

    const counts = await lockedCounts();

    expect(counts).toHaveLength(2);
    expect(counts).toContainEqual({
      fiscalAddressId,
      month: "2026-08",
      exceptionCount: 0,
      totalCount: 1,
    });
    expect(counts).toContainEqual({
      fiscalAddressId,
      month: "2026-09",
      exceptionCount: 0,
      totalCount: 2,
    });
  });

  it("answers only the months of the window", async () => {
    const { fiscalAddressId, registerId } = await anAddressWithRegister();
    await insertReceiptRequest(db, registerId, { issuedOn: "2024-12-31" });
    await insertReceiptRequest(db, registerId, { issuedOn: "2025-01-01" });
    await insertReceiptRequest(db, registerId, { issuedOn: "2026-10-01" });

    expect(await lockedCounts()).toEqual([
      { fiscalAddressId, month: "2025-01", exceptionCount: 0, totalCount: 1 },
    ]);
  });

  it("answers counts as numbers", async () => {
    const { registerId } = await anAddressWithRegister();
    await insertCaeaDocument(db, registerId, { issuedOn: "2026-09-12" });

    const [month] = await lockedCounts();

    expect(typeof month?.exceptionCount).toBe("number");
    expect(typeof month?.totalCount).toBe("number");
  });
});

describe("DrizzleExceptionShareBreachStore recording", () => {
  async function recordSeptemberBreach() {
    const { fiscalAddressId } = await anAddressWithRegister();
    const store = new DrizzleExceptionShareBreachStore(db, () => NOW);
    await store.transaction((transaction) =>
      transaction.recordBreach({
        fiscalAddressId,
        month: "2026-09",
        exceptionCount: 1,
        totalCount: 10,
      }),
    );
    return fiscalAddressId;
  }

  it("answers the recorded breaches of the window", async () => {
    const fiscalAddressId = await recordSeptemberBreach();
    await new DrizzleExceptionShareBreachStore(db, () => NOW).transaction((transaction) =>
      transaction.recordBreach({
        fiscalAddressId,
        month: "2024-12",
        exceptionCount: 2,
        totalCount: 10,
      }),
    );

    const recorded = await new DrizzleExceptionShareBreachStore(db, () => NOW).transaction(
      (transaction) => transaction.recordedBreaches(WINDOW),
    );

    expect(recorded).toEqual([
      { fiscalAddressId, month: "2026-09", exceptionCount: 1, totalCount: 10 },
    ]);
  });

  it("stamps the breach with the moment it was recorded and updated", async () => {
    await recordSeptemberBreach();

    const [stored] = await db.select().from(exceptionShareBreaches);

    expect(stored).toMatchObject({ recordedAt: NOW, updatedAt: NOW });
  });

  it("updates the counts of a recorded breach and keeps the moment it was first recorded", async () => {
    const fiscalAddressId = await recordSeptemberBreach();

    await new DrizzleExceptionShareBreachStore(db, () => LATER).transaction((transaction) =>
      transaction.updateRecordedBreach({
        fiscalAddressId,
        month: "2026-09",
        exceptionCount: 3,
        totalCount: 12,
      }),
    );

    const stored = await db
      .select()
      .from(exceptionShareBreaches)
      .orderBy(asc(exceptionShareBreaches.month));
    expect(stored).toMatchObject([
      { exceptionCount: 3, totalCount: 12, recordedAt: NOW, updatedAt: LATER },
    ]);
  });

  it("refuses to record the same fiscal address month twice", async () => {
    const fiscalAddressId = await recordSeptemberBreach();

    await expect(
      new DrizzleExceptionShareBreachStore(db, () => NOW).transaction((transaction) =>
        transaction.recordBreach({
          fiscalAddressId,
          month: "2026-09",
          exceptionCount: 2,
          totalCount: 10,
        }),
      ),
    ).rejects.toThrow();
  });

  it("leaves nothing recorded when the work fails", async () => {
    const { fiscalAddressId } = await anAddressWithRegister();

    await expect(
      new DrizzleExceptionShareBreachStore(db, () => NOW).transaction(async (transaction) => {
        await transaction.recordBreach({
          fiscalAddressId,
          month: "2026-09",
          exceptionCount: 1,
          totalCount: 10,
        });
        throw new Error("the work failed");
      }),
    ).rejects.toThrow("the work failed");

    expect(await db.select().from(exceptionShareBreaches)).toEqual([]);
  });
});

describe("recording the breaches of the closed months with the Drizzle store", () => {
  it("records a closed month that reached the threshold and none that did not", async () => {
    const { fiscalAddressId, registerId } = await anAddressWithRegister();
    await insertCaeaDocument(db, registerId, { issuedOn: "2026-08-12" });
    for (let voucher = 0; voucher < 19; voucher += 1) {
      await insertReceiptRequest(db, registerId, { issuedOn: "2026-08-13" });
    }
    await insertCaeaDocument(db, registerId, { issuedOn: "2026-07-12" });
    for (let voucher = 0; voucher < 20; voucher += 1) {
      await insertReceiptRequest(db, registerId, { issuedOn: "2026-07-13" });
    }

    const outcome = await recordExceptionShareBreaches({
      store: new DrizzleExceptionShareBreachStore(db, () => NOW),
      clock: { now: () => NOW },
      zoneRules: fixedZoneRulesSource(),
    });

    expect(outcome).toEqual({ kind: "recorded", recorded: 1, updated: 0 });
    expect(await db.select().from(exceptionShareBreaches)).toMatchObject([
      { fiscalAddressId, month: "2026-08", exceptionCount: 1, totalCount: 20 },
    ]);
  });
});
