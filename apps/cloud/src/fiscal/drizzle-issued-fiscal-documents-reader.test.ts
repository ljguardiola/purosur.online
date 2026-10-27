import type { IssuedFiscalDocumentsQuery } from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleIssuedFiscalDocumentsReader } from "./drizzle-issued-fiscal-documents-reader.js";
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

function issuedIn(locationId: string, overrides: Partial<IssuedFiscalDocumentsQuery> = {}) {
  return new DrizzleIssuedFiscalDocumentsReader(db).issuedInPeriod({
    locationId,
    range: wholeOctober,
    registerId: undefined,
    kind: undefined,
    number: undefined,
    page: { number: 1, size: 50 },
    ...overrides,
  });
}

describe("DrizzleIssuedFiscalDocumentsReader.issuedInPeriod", () => {
  describe("the receipts requested online", () => {
    it("lists a receipt authorized with its CAE, its register and the day it was issued", async () => {
      const { registerId, locationId } = await aBranchWithRegister("Caja 1");
      await insertReceiptRequest(db, registerId, {
        pointOfSale: 7,
        number: 12,
        issuedOn: "2026-10-05",
        total: 4_800,
        receivedAt: new Date("2026-10-05T13:00:00.000Z"),
      });

      const { documents, total } = await issuedIn(locationId);

      expect(total).toBe(1);
      expect(documents).toEqual([
        {
          kind: "receipt",
          voucherType: 11,
          pointOfSale: 7,
          number: 12,
          issuedOn: "2026-10-05",
          issuedAt: new Date("2026-10-05T13:00:00.000Z"),
          register: { id: registerId, name: "Caja 1" },
          authorization: { kind: "cae", code: "75123456789012", dueOn: "2026-10-15" },
          state: "authorized",
          contingency: false,
          total: 4_800,
          correctedVoucher: null,
        },
      ]);
    });

    it("lists a receipt whose unclear answer was resolved by adopting the tax authority's code", async () => {
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
      });

      const { documents } = await issuedIn(locationId);

      expect(documents).toMatchObject([
        {
          state: "authorized",
          authorization: { kind: "cae", code: "75999999999999", dueOn: "2026-10-16" },
        },
      ]);
    });

    it.each([
      [
        "requested and not answered yet",
        {
          answerKind: null,
          answeredAt: null,
          authorizationCode: null,
          authorizationCodeDueOn: null,
        },
      ],
      [
        "unclear and not decided",
        {
          answerKind: "unclear",
          unclearCodes: [500],
          authorizationCode: null,
          authorizationCodeDueOn: null,
        },
      ],
      [
        "never attempted and not decided",
        { answerKind: "not_attempted", authorizationCode: null, authorizationCodeDueOn: null },
      ],
    ])("lists a receipt %s as awaiting its authorization, without one", async (_name, columns) => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertReceiptRequest(db, registerId, columns);

      const { documents } = await issuedIn(locationId);

      expect(documents).toMatchObject([{ state: "awaiting_authorization", authorization: null }]);
    });

    it.each([
      [
        "rejected",
        {
          answerKind: "rejected",
          rejectionCodes: [10015],
          rejectionClass: "content",
          authorizationCode: null,
          authorizationCodeDueOn: null,
        },
      ],
      [
        "unclear and released",
        {
          answerKind: "unclear",
          unclearCodes: [500],
          authorizationCode: null,
          authorizationCodeDueOn: null,
          decision: "released",
          decidedAt: new Date("2026-10-05T13:05:00.000Z"),
        },
      ],
      [
        "unclear and conflicting",
        {
          answerKind: "unclear",
          unclearCodes: [500],
          authorizationCode: null,
          authorizationCodeDueOn: null,
          decision: "conflicting",
          decidedAt: new Date("2026-10-05T13:05:00.000Z"),
        },
      ],
    ])("leaves out a receipt that was %s", async (_name, columns) => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertReceiptRequest(db, registerId, columns);

      const { documents, total } = await issuedIn(locationId);

      expect(documents).toEqual([]);
      expect(total).toBe(0);
    });
  });

  describe("the credit notes requested online", () => {
    it("lists an authorized credit note with the receipt it corrects", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertOnlineCreditNote(db, registerId, {
        pointOfSale: 7,
        number: 3,
        associatedVoucherType: 11,
        associatedPointOfSale: 7,
        associatedNumber: 12,
        issuedOn: "2026-10-06",
        requestedAt: new Date("2026-10-06T14:00:00.000Z"),
        total: 4_800,
      });

      const { documents } = await issuedIn(locationId);

      expect(documents).toEqual([
        {
          kind: "credit_note",
          voucherType: 13,
          pointOfSale: 7,
          number: 3,
          issuedOn: "2026-10-06",
          issuedAt: new Date("2026-10-06T14:00:00.000Z"),
          register: expect.objectContaining({ name: "Caja 1" }),
          authorization: { kind: "cae", code: "75123456789099", dueOn: "2026-10-15" },
          state: "authorized",
          contingency: false,
          total: 4_800,
          correctedVoucher: { voucherType: 11, pointOfSale: 7, number: 12 },
        },
      ]);
    });

    it.each([
      [
        "requested and not answered yet",
        {
          answerKind: null,
          answeredAt: null,
          authorizationCode: null,
          authorizationCodeDueOn: null,
        },
      ],
      ["unclear", { answerKind: "unclear", authorizationCode: null, authorizationCodeDueOn: null }],
    ])("lists a credit note %s as awaiting its authorization", async (_name, columns) => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertOnlineCreditNote(db, registerId, columns);

      const { documents } = await issuedIn(locationId);

      expect(documents).toMatchObject([
        { kind: "credit_note", state: "awaiting_authorization", authorization: null },
      ]);
    });

    it("leaves out a rejected credit note", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertOnlineCreditNote(db, registerId, {
        answerKind: "rejected",
        rejections: [],
        authorizationCode: null,
        authorizationCodeDueOn: null,
      });

      expect((await issuedIn(locationId)).documents).toEqual([]);
    });

    it("leaves out a credit note not requested yet", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertOnlineCreditNote(db, registerId, {
        number: null,
        issuedOn: null,
        requestedAt: null,
        answerKind: null,
        answeredAt: null,
        authorizationCode: null,
        authorizationCodeDueOn: null,
      });

      const { documents, total } = await issuedIn(locationId);

      expect(documents).toEqual([]);
      expect(total).toBe(0);
    });
  });

  describe("the documents issued under a pre-obtained code", () => {
    it("lists a receipt with its CAEA and fortnight as authorized contingency", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertCaeaDocument(db, registerId, {
        pointOfSale: 8,
        number: 5,
        issuedOn: "2026-10-05",
        generatedAt: new Date("2026-10-05T15:00:00.000Z"),
        total: 3_000,
      });

      const { documents } = await issuedIn(locationId);

      expect(documents).toEqual([
        {
          kind: "receipt",
          voucherType: 11,
          pointOfSale: 8,
          number: 5,
          issuedOn: "2026-10-05",
          issuedAt: new Date("2026-10-05T15:00:00.000Z"),
          register: expect.objectContaining({ id: registerId }),
          authorization: {
            kind: "caea",
            code: "21403471111111",
            fortnightStart: "2026-10-01",
            fortnightEnd: "2026-10-15",
          },
          state: "authorized",
          contingency: true,
          total: 3_000,
          correctedVoucher: null,
        },
      ]);
    });

    it("lists a credit note with the receipt it corrects", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertCaeaDocument(db, registerId, {
        documentType: "credit_note_c",
        creditNoteId: crypto.randomUUID(),
        correctedVoucherType: 11,
        correctedPointOfSale: 8,
        correctedNumber: 5,
      });

      const { documents } = await issuedIn(locationId);

      expect(documents).toMatchObject([
        {
          kind: "credit_note",
          voucherType: 13,
          contingency: true,
          correctedVoucher: { voucherType: 11, pointOfSale: 8, number: 5 },
        },
      ]);
    });
  });

  describe("the filters", () => {
    it("lists only the documents of the asked branch", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      const otherLocation = await insertLocation(db);
      const otherRegister = await insertRegisterOf(db, otherLocation, "Caja 9");
      await insertReceiptRequest(db, registerId);
      await insertReceiptRequest(db, otherRegister);
      await insertCaeaDocument(db, otherRegister);
      await insertOnlineCreditNote(db, otherRegister);

      const { documents, total } = await issuedIn(locationId);

      expect(total).toBe(1);
      expect(documents.map(({ register }) => register.id)).toEqual([registerId]);
    });

    it("lists only the documents of the asked register", async () => {
      const { registerId, locationId } = await aBranchWithRegister("Caja 1");
      const otherRegister = await insertRegisterOf(db, locationId, "Caja 2");
      await insertReceiptRequest(db, registerId);
      await insertCaeaDocument(db, registerId);
      await insertOnlineCreditNote(db, registerId);
      await insertReceiptRequest(db, otherRegister);

      const { documents, total } = await issuedIn(locationId, { registerId: otherRegister });

      expect(total).toBe(1);
      expect(documents.map(({ register }) => register.name)).toEqual(["Caja 2"]);
    });

    it("lists only the documents issued from the first to the last day asked, both included", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      for (const issuedOn of ["2026-09-30", "2026-10-01", "2026-10-03", "2026-10-04"]) {
        await insertReceiptRequest(db, registerId, { issuedOn });
        await insertCaeaDocument(db, registerId, { issuedOn });
        await insertOnlineCreditNote(db, registerId, { issuedOn });
      }

      const { documents, total } = await issuedIn(locationId, {
        range: { from: "2026-10-01", to: "2026-10-03" },
      });

      expect(total).toBe(6);
      expect(new Set(documents.map(({ issuedOn }) => issuedOn))).toEqual(
        new Set(["2026-10-01", "2026-10-03"]),
      );
    });

    it("lists only receipts or only credit notes of every source when a kind is asked", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertReceiptRequest(db, registerId);
      await insertCaeaDocument(db, registerId);
      await insertOnlineCreditNote(db, registerId);
      await insertCaeaDocument(db, registerId, {
        documentType: "credit_note_c",
        creditNoteId: crypto.randomUUID(),
        correctedVoucherType: 11,
        correctedPointOfSale: 8,
        correctedNumber: 5,
      });

      const receipts = await issuedIn(locationId, { kind: "receipt" });
      const creditNotes = await issuedIn(locationId, { kind: "credit_note" });

      expect(receipts.documents.map(({ kind }) => kind)).toEqual(["receipt", "receipt"]);
      expect(receipts.total).toBe(2);
      expect(creditNotes.documents.map(({ kind }) => kind)).toEqual(["credit_note", "credit_note"]);
      expect(creditNotes.total).toBe(2);
    });

    it("lists the documents of every source that carry the asked voucher number", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertReceiptRequest(db, registerId, { number: 40 });
      await insertReceiptRequest(db, registerId, { number: 41 });
      await insertCaeaDocument(db, registerId, { number: 40 });
      await insertOnlineCreditNote(db, registerId, { number: 40, associatedNumber: 90 });

      const { documents, total } = await issuedIn(locationId, { number: 40 });

      expect(total).toBe(3);
      expect(documents.map(({ number }) => number)).toEqual([40, 40, 40]);
    });
  });

  describe("the order and the pages", () => {
    it("lists the latest day first, then the latest time, then the highest point of sale and number", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      const sameTime = new Date("2026-10-05T13:00:00.000Z");
      await insertReceiptRequest(db, registerId, { issuedOn: "2026-10-04", number: 90 });
      await insertReceiptRequest(db, registerId, { number: 10, receivedAt: sameTime });
      await insertReceiptRequest(db, registerId, { number: 11, receivedAt: sameTime });
      await insertCaeaDocument(db, registerId, {
        number: 5,
        generatedAt: new Date("2026-10-05T18:00:00.000Z"),
      });
      await insertReceiptRequest(db, registerId, { issuedOn: "2026-10-06", number: 1 });

      const { documents } = await issuedIn(locationId);

      expect(documents.map(({ number }) => number)).toEqual([1, 5, 11, 10, 90]);
    });

    it("answers the asked page and the total of the whole listing", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      for (const number of [1, 2, 3, 4, 5]) {
        await insertReceiptRequest(db, registerId, { number });
      }

      const second = await issuedIn(locationId, { page: { number: 2, size: 2 } });
      const last = await issuedIn(locationId, { page: { number: 3, size: 2 } });
      const beyond = await issuedIn(locationId, { page: { number: 4, size: 2 } });

      expect(second.documents.map(({ number }) => number)).toEqual([3, 2]);
      expect(last.documents.map(({ number }) => number)).toEqual([1]);
      expect(beyond.documents).toEqual([]);
      expect([second.total, last.total, beyond.total]).toEqual([5, 5, 5]);
    });
  });
});
