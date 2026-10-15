import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleOfflineDocumentsOfFortnight } from "./drizzle-offline-documents-of-fortnight.js";
import { insertOfflineFiscalDocument } from "./test-support/offline-fiscal-document-fixtures.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";

const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const OCTOBER_SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let registerId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  registerId = await seedOfflinePointOfSale(db);
});

describe("DrizzleOfflineDocumentsOfFortnight", () => {
  it("reads no document of a point of sale that issued none under the fortnight's code", async () => {
    expect(
      await new DrizzleOfflineDocumentsOfFortnight(db).documentsOn(8, OCTOBER_FIRST_HALF),
    ).toEqual([]);
  });

  it("reads what the tax authority is told of each document the point of sale issued under the fortnight's code, and only those", async () => {
    await insertOfflineFiscalDocument(db, {
      registerId,
      pointOfSale: 8,
      fortnight: OCTOBER_FIRST_HALF,
      number: 2,
    });
    await insertOfflineFiscalDocument(db, {
      registerId,
      pointOfSale: 8,
      fortnight: OCTOBER_FIRST_HALF,
      number: 1,
    });
    await insertOfflineFiscalDocument(db, {
      registerId,
      pointOfSale: 8,
      fortnight: OCTOBER_SECOND_HALF,
      number: 3,
    });
    await insertOfflineFiscalDocument(db, {
      registerId,
      pointOfSale: 9,
      fortnight: OCTOBER_FIRST_HALF,
      number: 1,
    });

    const documents = new DrizzleOfflineDocumentsOfFortnight(db);

    expect(await documents.documentsOn(8, OCTOBER_FIRST_HALF)).toEqual(
      [1, 2].map((number) => ({
        documentType: "factura_c",
        number,
        issuedOn: "2026-10-01",
        generatedAt: new Date("2026-10-01T12:00:00.000Z"),
        buyerDocumentType: 99,
        buyerDocumentNumber: 0,
        buyerTaxStatusCode: 5,
        total: 10_000,
        netAmount: 10_000,
      })),
    );
    expect(
      (await documents.documentsOn(8, OCTOBER_SECOND_HALF)).map(({ number }) => number),
    ).toEqual([3]);
  });
});
