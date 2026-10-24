import type { FiscalTaskDocumentType } from "@purosur/domain";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { taxAuthorityLastAuthorizedNumbers } from "../platform/db/schema.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleTaxAuthorityCounts } from "./drizzle-tax-authority-counts.js";
import { insertRegisterWithPointOfSale } from "./test-support/authorization-request-fixtures.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";

const READ_AT = new Date("2026-10-06T15:00:00.000Z");
const LATER = new Date("2026-10-06T16:00:00.000Z");

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

async function storedCount(
  pointOfSale: number,
  documentType: FiscalTaskDocumentType = "factura_c",
) {
  const [row] = await db
    .select()
    .from(taxAuthorityLastAuthorizedNumbers)
    .where(
      and(
        eq(taxAuthorityLastAuthorizedNumbers.pointOfSaleNumber, pointOfSale),
        eq(taxAuthorityLastAuthorizedNumbers.documentType, documentType),
      ),
    );
  return row;
}

describe("DrizzleTaxAuthorityCounts", () => {
  it("keeps the number the tax authority last authorized for a point of sale, and when it was read", async () => {
    await new DrizzleTaxAuthorityCounts(db).advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 41,
      readAt: READ_AT,
    });

    expect(await storedCount(7)).toEqual({
      pointOfSaleNumber: 7,
      documentType: "factura_c",
      lastAuthorized: 41,
      issuedOn: null,
      readAt: READ_AT,
    });
  });

  it("never lowers the number already stored, whichever order the reads are recorded in", async () => {
    const counts = new DrizzleTaxAuthorityCounts(db);
    await counts.advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 44,
      readAt: LATER,
    });

    await counts.advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 41,
      readAt: READ_AT,
    });

    expect(await storedCount(7)).toMatchObject({ lastAuthorized: 44 });
  });

  it("replaces the number of an earlier read", async () => {
    const counts = new DrizzleTaxAuthorityCounts(db);
    await counts.advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 41,
      readAt: READ_AT,
    });

    await counts.advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 44,
      readAt: LATER,
    });

    expect(await storedCount(7)).toEqual({
      pointOfSaleNumber: 7,
      documentType: "factura_c",
      lastAuthorized: 44,
      issuedOn: null,
      readAt: LATER,
    });
  });

  it("keeps the day the last authorized document was issued on beside its number", async () => {
    await new DrizzleTaxAuthorityCounts(db).advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 41,
      issuedOn: "2026-10-05",
      readAt: READ_AT,
    });

    expect(await storedCount(7)).toMatchObject({ lastAuthorized: 41, issuedOn: "2026-10-05" });
  });

  it("replaces the day with the known day of a higher number, and keeps the day it holds when the higher number's is unknown", async () => {
    const counts = new DrizzleTaxAuthorityCounts(db);
    await counts.advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 41,
      issuedOn: "2026-10-05",
      readAt: READ_AT,
    });

    await counts.advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 44,
      issuedOn: "2026-10-06",
      readAt: LATER,
    });
    expect(await storedCount(7)).toMatchObject({ lastAuthorized: 44, issuedOn: "2026-10-06" });

    await counts.advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 45,
      issuedOn: null,
      readAt: LATER,
    });
    expect(await storedCount(7)).toMatchObject({ lastAuthorized: 45, issuedOn: "2026-10-06" });
  });

  it("keeps the day of the highest number when a lower number is recorded afterwards", async () => {
    const counts = new DrizzleTaxAuthorityCounts(db);
    await counts.advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 44,
      issuedOn: "2026-10-06",
      readAt: LATER,
    });

    await counts.advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 41,
      issuedOn: "2026-10-05",
      readAt: READ_AT,
    });

    expect(await storedCount(7)).toMatchObject({ lastAuthorized: 44, issuedOn: "2026-10-06" });
  });

  it("keeps a known day when the same number is read again without it", async () => {
    const counts = new DrizzleTaxAuthorityCounts(db);
    await counts.advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 41,
      issuedOn: "2026-10-05",
      readAt: READ_AT,
    });

    await counts.advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 41,
      readAt: LATER,
    });

    expect(await storedCount(7)).toEqual({
      pointOfSaleNumber: 7,
      documentType: "factura_c",
      lastAuthorized: 41,
      issuedOn: "2026-10-05",
      readAt: LATER,
    });
  });

  it("learns the day of a number already stored without one", async () => {
    const counts = new DrizzleTaxAuthorityCounts(db);
    await counts.advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 41,
      issuedOn: null,
      readAt: READ_AT,
    });

    await counts.advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 41,
      issuedOn: "2026-10-05",
      readAt: LATER,
    });

    expect(await storedCount(7)).toMatchObject({ lastAuthorized: 41, issuedOn: "2026-10-05" });
  });

  it("logs the point of sale of the register that holds it again when only the day becomes known, so the register pulls it", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 7,
      name: "caja-1",
    });
    await new DrizzleTaxAuthorityCounts(db).advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 41,
      readAt: READ_AT,
    });
    const mark = await lastLoggedChangeSeq(db);

    await new DrizzleTaxAuthorityCounts(db).advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 41,
      issuedOn: "2026-10-05",
      readAt: LATER,
    });

    expect(await changesLoggedAfter(db, mark)).toMatchObject([
      { entity: "register_point_of_sale", entityId: registerId, op: "update" },
    ]);
  });

  it("logs a change of the point of sale of the register that holds it, at its current version, so the register pulls it again", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 7,
      name: "caja-1",
    });
    const mark = await lastLoggedChangeSeq(db);

    await new DrizzleTaxAuthorityCounts(db).advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 41,
      readAt: READ_AT,
    });

    expect(await changesLoggedAfter(db, mark)).toMatchObject([
      { entity: "register_point_of_sale", entityId: registerId, version: 1, op: "update" },
    ]);
  });

  it("logs a change of the offline point of sale of the register that holds it, at its current version, so the register pulls it again", async () => {
    const registerId = await seedOfflinePointOfSale(db);
    const mark = await lastLoggedChangeSeq(db);

    await new DrizzleTaxAuthorityCounts(db).advance({
      pointOfSale: 8,
      documentType: "factura_c",
      lastAuthorized: 41,
      readAt: READ_AT,
    });

    expect(await changesLoggedAfter(db, mark)).toMatchObject([
      { entity: "register_offline_point_of_sale", entityId: registerId, version: 1, op: "update" },
    ]);
  });

  it("logs only the point of sale, not the offline one, when the count is of the real-time number", async () => {
    const registerId = await seedOfflinePointOfSale(db);
    const mark = await lastLoggedChangeSeq(db);

    await new DrizzleTaxAuthorityCounts(db).advance({
      pointOfSale: 7,
      documentType: "factura_c",
      lastAuthorized: 41,
      readAt: READ_AT,
    });

    expect(await changesLoggedAfter(db, mark)).toMatchObject([
      { entity: "register_point_of_sale", entityId: registerId, version: 1, op: "update" },
    ]);
  });

  it("logs no change when no register holds the point of sale", async () => {
    await insertRegisterWithPointOfSale(db, { pointOfSaleNumber: 7, name: "caja-1" });
    const mark = await lastLoggedChangeSeq(db);

    await new DrizzleTaxAuthorityCounts(db).advance({
      pointOfSale: 9,
      documentType: "factura_c",
      lastAuthorized: 5,
      readAt: READ_AT,
    });

    expect(await changesLoggedAfter(db, mark)).toEqual([]);
    expect((await storedCount(9))?.lastAuthorized).toBe(5);
  });

  describe("for the credit notes of a point of sale", () => {
    it("keeps the last credit note C the tax authority authorized beside the factura count of the same point of sale", async () => {
      const counts = new DrizzleTaxAuthorityCounts(db);
      await counts.advance({
        pointOfSale: 8,
        documentType: "factura_c",
        lastAuthorized: 41,
        readAt: READ_AT,
      });

      await counts.advance({
        pointOfSale: 8,
        documentType: "credit_note_c",
        lastAuthorized: 4,
        issuedOn: "2026-10-05",
        readAt: LATER,
      });

      expect(await storedCount(8)).toMatchObject({ lastAuthorized: 41, readAt: READ_AT });
      expect(await storedCount(8, "credit_note_c")).toEqual({
        pointOfSaleNumber: 8,
        documentType: "credit_note_c",
        lastAuthorized: 4,
        issuedOn: "2026-10-05",
        readAt: LATER,
      });
    });

    it("never lowers the credit note count already stored", async () => {
      const counts = new DrizzleTaxAuthorityCounts(db);
      await counts.advance({
        pointOfSale: 8,
        documentType: "credit_note_c",
        lastAuthorized: 9,
        readAt: LATER,
      });

      await counts.advance({
        pointOfSale: 8,
        documentType: "credit_note_c",
        lastAuthorized: 4,
        readAt: READ_AT,
      });

      expect(await storedCount(8, "credit_note_c")).toMatchObject({ lastAuthorized: 9 });
    });

    it("logs the offline point of sale of the register that holds it, so the register pulls the credit note count", async () => {
      const registerId = await seedOfflinePointOfSale(db);
      const mark = await lastLoggedChangeSeq(db);

      await new DrizzleTaxAuthorityCounts(db).advance({
        pointOfSale: 8,
        documentType: "credit_note_c",
        lastAuthorized: 4,
        readAt: READ_AT,
      });

      expect(await changesLoggedAfter(db, mark)).toMatchObject([
        {
          entity: "register_offline_point_of_sale",
          entityId: registerId,
          version: 1,
          op: "update",
        },
      ]);
    });
  });
});
