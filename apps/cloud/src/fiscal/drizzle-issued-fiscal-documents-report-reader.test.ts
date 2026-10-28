import type { IssuedFiscalDocumentsReportQuery } from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleIssuedFiscalDocumentsReportReader } from "./drizzle-issued-fiscal-documents-report-reader.js";
import {
  insertCaeaDocument,
  insertOnlineCreditNote,
  insertReceiptRequest,
  insertRegisterOf,
} from "./test-support/issued-document-fixtures.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const wholeOctober = { from: "2026-10-01", to: "2026-10-31" };

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

async function aBranchWithRegister(name = "Caja 1") {
  const { registerId, locationId } = await insertEnrolledInstallation(db, {
    now: NOW,
    registerName: name,
  });
  return { registerId, locationId };
}

function groupsOf(locationId: string, overrides: Partial<IssuedFiscalDocumentsReportQuery> = {}) {
  return new DrizzleIssuedFiscalDocumentsReportReader(db).issuedGroups({
    locationId,
    range: wholeOctober,
    registerId: undefined,
    ...overrides,
  });
}

describe("DrizzleIssuedFiscalDocumentsReportReader.issuedGroups", () => {
  it("reads no group when nothing was issued", async () => {
    const { locationId } = await aBranchWithRegister();

    expect(await groupsOf(locationId)).toEqual([]);
  });

  it("groups receipts by point of sale and authorization kind with their count and amount", async () => {
    const { registerId, locationId } = await aBranchWithRegister();
    await insertReceiptRequest(db, registerId, { pointOfSale: 7, total: 4_800 });
    await insertReceiptRequest(db, registerId, { pointOfSale: 7, total: 1_200 });
    await insertReceiptRequest(db, registerId, { pointOfSale: 5, total: 700 });
    await insertCaeaDocument(db, registerId, { pointOfSale: 8, total: 3_000 });
    await insertCaeaDocument(db, registerId, { pointOfSale: 8, total: 500 });

    const groups = await groupsOf(locationId);

    expect(groups).toHaveLength(3);
    expect(groups).toEqual(
      expect.arrayContaining([
        {
          kind: "receipt",
          voucherType: 11,
          pointOfSale: 7,
          authorizationKind: "cae",
          count: 2,
          amount: 6_000,
        },
        {
          kind: "receipt",
          voucherType: 11,
          pointOfSale: 5,
          authorizationKind: "cae",
          count: 1,
          amount: 700,
        },
        {
          kind: "receipt",
          voucherType: 11,
          pointOfSale: 8,
          authorizationKind: "caea",
          count: 2,
          amount: 3_500,
        },
      ]),
    );
  });

  it("groups the credit notes apart from the receipts, with their amount unsigned", async () => {
    const { registerId, locationId } = await aBranchWithRegister();
    await insertReceiptRequest(db, registerId, { total: 4_800 });
    await insertOnlineCreditNote(db, registerId, { total: 1_500 });
    await insertCaeaDocument(db, registerId, {
      documentType: "credit_note_c",
      total: 400,
      correctedVoucherType: 11,
      correctedPointOfSale: 8,
      correctedNumber: 5,
    });

    const groups = await groupsOf(locationId);

    expect(groups).toHaveLength(3);
    expect(groups).toEqual(
      expect.arrayContaining([
        {
          kind: "credit_note",
          voucherType: 13,
          pointOfSale: 7,
          authorizationKind: "cae",
          count: 1,
          amount: 1_500,
        },
        {
          kind: "credit_note",
          voucherType: 13,
          pointOfSale: 8,
          authorizationKind: "caea",
          count: 1,
          amount: 400,
        },
      ]),
    );
  });

  it("counts a receipt whose unclear answer was resolved by adopting the tax authority's code", async () => {
    const { registerId, locationId } = await aBranchWithRegister();
    await insertReceiptRequest(db, registerId, {
      answerKind: "unclear",
      unclearCodes: [500],
      authorizationCode: null,
      authorizationCodeDueOn: null,
      decision: "adopted",
      decidedAt: new Date("2026-10-05T13:05:00.000Z"),
      adoptedAuthorizationCode: "75999999999999",
      adoptedAuthorizationCodeDueOn: "2026-10-16",
      total: 900,
    });

    expect(await groupsOf(locationId)).toEqual([
      {
        kind: "receipt",
        voucherType: 11,
        pointOfSale: 7,
        authorizationKind: "cae",
        count: 1,
        amount: 900,
      },
    ]);
  });

  it("does not count the documents still awaiting their authorization", async () => {
    const { registerId, locationId } = await aBranchWithRegister();
    await insertReceiptRequest(db, registerId, {
      answerKind: null,
      answeredAt: null,
      authorizationCode: null,
      authorizationCodeDueOn: null,
    });
    await insertReceiptRequest(db, registerId, {
      answerKind: "unclear",
      unclearCodes: [500],
      authorizationCode: null,
      authorizationCodeDueOn: null,
    });
    await insertOnlineCreditNote(db, registerId, {
      answerKind: null,
      answeredAt: null,
      authorizationCode: null,
      authorizationCodeDueOn: null,
    });

    expect(await groupsOf(locationId)).toEqual([]);
  });

  it("counts only the documents issued on a day of the range, both ends included", async () => {
    const { registerId, locationId } = await aBranchWithRegister();
    await insertReceiptRequest(db, registerId, { issuedOn: "2026-09-30", total: 1 });
    await insertReceiptRequest(db, registerId, { issuedOn: "2026-10-01", total: 20 });
    await insertReceiptRequest(db, registerId, { issuedOn: "2026-10-06", total: 300 });
    await insertReceiptRequest(db, registerId, { issuedOn: "2026-10-07", total: 4_000 });

    const groups = await groupsOf(locationId, { range: { from: "2026-10-01", to: "2026-10-06" } });

    expect(groups).toMatchObject([{ count: 2, amount: 320 }]);
  });

  it("counts only the documents of the asked branch", async () => {
    const { registerId, locationId } = await aBranchWithRegister();
    const otherRegister = await insertRegisterOf(db, await insertLocation(db), "Caja 9");
    await insertReceiptRequest(db, registerId, { total: 100 });
    await insertReceiptRequest(db, otherRegister, { total: 8_000 });
    await insertCaeaDocument(db, otherRegister);
    await insertOnlineCreditNote(db, otherRegister);

    expect(await groupsOf(locationId)).toMatchObject([{ count: 1, amount: 100 }]);
  });

  it("counts only the documents of the asked register", async () => {
    const { registerId, locationId } = await aBranchWithRegister("Caja 1");
    const otherRegister = await insertRegisterOf(db, locationId, "Caja 2");
    await insertReceiptRequest(db, registerId, { total: 100 });
    await insertReceiptRequest(db, otherRegister, { total: 8_000 });
    await insertCaeaDocument(db, otherRegister);

    const groups = await groupsOf(locationId, { registerId });

    expect(groups).toMatchObject([{ count: 1, amount: 100 }]);
  });
});
