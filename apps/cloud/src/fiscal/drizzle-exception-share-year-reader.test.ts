import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleExceptionShareBreachStore } from "./drizzle-exception-share-breach-store.js";
import { DrizzleExceptionShareYearReader } from "./drizzle-exception-share-year-reader.js";
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

async function anAddressWithRegister(name = "Depósito Central") {
  const fiscalAddressId = await insertFiscalAddress(db, name);
  const registerId = await insertRegisterAtFiscalAddress(db, fiscalAddressId, `Caja de ${name}`);
  return { fiscalAddressId, registerId };
}

describe("DrizzleExceptionShareYearReader.fiscalAddress", () => {
  it("answers the id and the name of the fiscal address", async () => {
    const { fiscalAddressId } = await anAddressWithRegister("Depósito Central");

    expect(await new DrizzleExceptionShareYearReader(db).fiscalAddress(fiscalAddressId)).toEqual({
      id: fiscalAddressId,
      name: "Depósito Central",
    });
  });

  it("answers nothing for an address that does not exist", async () => {
    expect(
      await new DrizzleExceptionShareYearReader(db).fiscalAddress(
        "0d9c4f6e-2b1a-4c3d-8e5f-6a7b8c9d0e1f",
      ),
    ).toBeUndefined();
  });
});

describe("DrizzleExceptionShareYearReader.monthlyVoucherCounts", () => {
  it("counts the vouchers of each month of the year of the fiscal address, the running month included", async () => {
    const { fiscalAddressId, registerId } = await anAddressWithRegister();
    const other = await anAddressWithRegister("Local Norte");
    await insertReceiptRequest(db, registerId, { issuedOn: "2026-09-10" });
    await insertCaeaDocument(db, registerId, { issuedOn: "2026-09-11" });
    await insertOnlineCreditNote(db, registerId, { issuedOn: "2026-10-02" });
    await insertReceiptRequest(db, registerId, { issuedOn: "2025-12-31" });
    await insertReceiptRequest(db, registerId, { issuedOn: "2027-01-01" });
    await insertReceiptRequest(db, other.registerId, { issuedOn: "2026-09-10" });

    const counts = await new DrizzleExceptionShareYearReader(db).monthlyVoucherCounts({
      fiscalAddressId,
      year: 2026,
    });

    expect(counts).toHaveLength(2);
    expect(counts).toContainEqual({ month: "2026-09", exceptionCount: 1, totalCount: 2 });
    expect(counts).toContainEqual({ month: "2026-10", exceptionCount: 0, totalCount: 1 });
  });
});

describe("DrizzleExceptionShareYearReader.recordedBreachMonths", () => {
  it("answers the months of the year recorded for the fiscal address and no other", async () => {
    const { fiscalAddressId } = await anAddressWithRegister();
    const other = await anAddressWithRegister("Local Norte");
    const store = new DrizzleExceptionShareBreachStore(db, () => NOW);
    await store.transaction(async (transaction) => {
      for (const [address, month] of [
        [fiscalAddressId, "2026-03"],
        [fiscalAddressId, "2026-08"],
        [fiscalAddressId, "2025-12"],
        [other.fiscalAddressId, "2026-05"],
      ] as const) {
        await transaction.recordBreach({
          fiscalAddressId: address,
          month,
          exceptionCount: 1,
          totalCount: 10,
        });
      }
    });

    const months = await new DrizzleExceptionShareYearReader(db).recordedBreachMonths({
      fiscalAddressId,
      year: 2026,
    });

    expect([...months].sort()).toEqual(["2026-03", "2026-08"]);
  });
});
