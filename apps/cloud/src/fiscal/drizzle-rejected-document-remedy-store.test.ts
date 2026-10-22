import type { Fortnight } from "@purosur/domain/fiscal/use-cases";
import { remedyRejectedDocument } from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, locations, rejectedDocumentRemedies, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleFortnightReportStore } from "./drizzle-fortnight-report-store.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { DrizzleRejectedDocumentRemedyStore } from "./drizzle-rejected-document-remedy-store.js";
import { insertOfflineFiscalDocument } from "./test-support/offline-fiscal-document-fixtures.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";
import {
  insertRejectedDocumentRemedy,
  WITHOUT_CREDIT_NOTES,
} from "./test-support/rejected-document-remedy-fixtures.js";

const OCTOBER_FIRST_HALF: Fortnight = { start: "2026-10-01", end: "2026-10-15" };
const OFFLINE_POINT_OF_SALE = 8;
const KEY = { pointOfSaleNumber: OFFLINE_POINT_OF_SALE, fortnight: OCTOBER_FIRST_HALF };
const REJECTED_AT = new Date("2026-10-16T12:00:00.000Z");
const REMEDIED_AT = new Date("2026-10-17T12:00:00.000Z");
const REJECTIONS = [{ code: 10016, message: "Fictional observation" }];

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let registerId: string;
let actorId: string;
let documentId: string;
let locationId: string;

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
  locationId = await seededLocationId(db);
  const [actor] = await db.select({ id: users.id }).from(users);
  actorId = actor?.id as string;
  await new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(
    OCTOBER_FIRST_HALF,
    (acquisition) =>
      acquisition.keep({
        code: {
          code: "36123456789012",
          fortnight: OCTOBER_FIRST_HALF,
          reportDeadline: "2026-10-20",
        },
        obtainedAt: new Date("2026-09-28T12:00:00.000Z"),
        obtainedThrough: "requested",
      }),
  );
  await insertOfflineFiscalDocument(db, {
    registerId,
    pointOfSale: OFFLINE_POINT_OF_SALE,
    fortnight: OCTOBER_FIRST_HALF,
    number: 1,
  });
  ({ id: documentId } = await insertOfflineFiscalDocument(db, {
    registerId,
    pointOfSale: OFFLINE_POINT_OF_SALE,
    fortnight: OCTOBER_FIRST_HALF,
    number: 2,
  }));
});

function rejectDocumentTwo() {
  return new DrizzleFortnightReportStore(db, WITHOUT_CREDIT_NOTES).holdReport(KEY, (report) =>
    report.recordDocumentType({
      documentType: "factura_c",
      state: "refused",
      at: REJECTED_AT,
      reportedThrough: 1,
      rejectedNumber: 2,
      rejections: REJECTIONS,
    }),
  );
}

const store = () => new DrizzleRejectedDocumentRemedyStore(db);

const AUDIT = {
  pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
  fortnight: OCTOBER_FIRST_HALF,
  documentType: "factura_c",
  number: 2,
  at: REMEDIED_AT,
} as const;

describe("DrizzleRejectedDocumentRemedyStore reads", () => {
  it("recalls no report of a document type that was never presented", async () => {
    expect(
      await store().transaction((tx) => tx.documentTypeReport(KEY, "factura_c", locationId)),
    ).toBeNull();
  });

  it("recalls the report of a document type with its rejected document, its rejections and the remedy recorded for that rejection", async () => {
    await rejectDocumentTwo();
    await insertRejectedDocumentRemedy(db, {
      pointOfSale: OFFLINE_POINT_OF_SALE,
      fortnight: OCTOBER_FIRST_HALF,
      number: 2,
      correction: { issuedOn: "2026-10-02" },
      rejectedAt: REJECTED_AT,
      recordedAt: REMEDIED_AT,
    });

    expect(
      await store().transaction((tx) => tx.documentTypeReport(KEY, "factura_c", locationId)),
    ).toEqual({
      documentType: "factura_c",
      state: "refused",
      reportedThrough: 1,
      rejectedNumber: 2,
      lastAttemptAt: REJECTED_AT,
      rejections: REJECTIONS,
      remedy: { number: 2, rejectedAt: REJECTED_AT },
    });
  });

  it("reads the documents of the fortnight with the corrections already recorded for them", async () => {
    await insertRejectedDocumentRemedy(db, {
      pointOfSale: OFFLINE_POINT_OF_SALE,
      fortnight: OCTOBER_FIRST_HALF,
      number: 2,
      correction: { total: 12_500 },
      recordedAt: REMEDIED_AT,
    });

    const documents = await store().transaction((tx) =>
      tx.documentsOn(OFFLINE_POINT_OF_SALE, OCTOBER_FIRST_HALF, locationId),
    );

    expect(documents.map(({ number, correction }) => [number, correction])).toEqual([
      [1, null],
      [2, { total: 12_500 }],
    ]);
  });
});

describe("DrizzleRejectedDocumentRemedyStore reads of another branch", () => {
  async function anotherBranch() {
    const [other] = await db.insert(locations).values({}).returning({ id: locations.id });
    return other?.id as string;
  }

  it("recalls no report of a point of sale whose register belongs to another branch", async () => {
    await rejectDocumentTwo();
    const other = await anotherBranch();

    expect(
      await store().transaction((tx) => tx.documentTypeReport(KEY, "factura_c", other)),
    ).toBeNull();
    expect(
      await store().transaction((tx) => tx.documentTypeReport(KEY, "factura_c", locationId)),
    ).not.toBeNull();
  });

  it("reads no document of a point of sale whose register belongs to another branch", async () => {
    const other = await anotherBranch();

    expect(
      await store().transaction((tx) =>
        tx.documentsOn(OFFLINE_POINT_OF_SALE, OCTOBER_FIRST_HALF, other),
      ),
    ).toEqual([]);
  });
});

describe("DrizzleRejectedDocumentRemedyStore writes", () => {
  it("records a remedy that reports the document again without a correction", async () => {
    await store().transaction((tx) =>
      tx.recordRemedy({
        pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
        fortnight: OCTOBER_FIRST_HALF,
        documentType: "factura_c",
        number: 2,
        remedy: { kind: "report" },
        rejectedAt: REJECTED_AT,
        recordedAt: REMEDIED_AT,
      }),
    );

    expect(await db.select().from(rejectedDocumentRemedies)).toEqual([
      expect.objectContaining({
        pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
        fortnightStart: "2026-10-01",
        documentType: "factura_c",
        number: 2,
        kind: "report",
        correction: null,
        rejectedAt: REJECTED_AT,
        recordedAt: REMEDIED_AT,
      }),
    ]);
  });

  it("records a remedy that corrects the document with the whole correction", async () => {
    await store().transaction((tx) =>
      tx.recordRemedy({
        pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
        fortnight: OCTOBER_FIRST_HALF,
        documentType: "factura_c",
        number: 2,
        remedy: { kind: "printed", correction: { issuedOn: "2026-10-02", total: 12_500 } },
        rejectedAt: REJECTED_AT,
        recordedAt: REMEDIED_AT,
      }),
    );

    expect(await db.select().from(rejectedDocumentRemedies)).toEqual([
      expect.objectContaining({
        kind: "printed",
        correction: { issuedOn: "2026-10-02", total: 12_500 },
      }),
    ]);
  });

  it("audits a correction with who made it, when, and only the fields it changed before and after in snake case", async () => {
    await store().transaction((tx) =>
      tx.recordRemedyAudit({
        ...AUDIT,
        kind: "printed",
        actorId,
        changes: [
          { field: "issuedOn", before: "2026-10-01", after: "2026-10-02" },
          { field: "total", before: 10_000, after: 12_500 },
          { field: "buyerDocumentType", before: 99, after: 80 },
          { field: "buyerDocumentNumber", before: 0, after: 20_000_000_001 },
          { field: "buyerTaxStatusCode", before: 5, after: 1 },
        ],
      }),
    );

    expect(await db.select().from(auditLog)).toEqual([
      expect.objectContaining({
        entity: "offline_fiscal_document",
        entityId: documentId,
        actorId,
        at: REMEDIED_AT,
        previousValue: {
          issued_on: "2026-10-01",
          total: 10_000,
          buyer_document_type: 99,
          buyer_document_number: 0,
          buyer_tax_status_code: 5,
        },
        newValue: {
          issued_on: "2026-10-02",
          total: 12_500,
          buyer_document_type: 80,
          buyer_document_number: 20_000_000_001,
          buyer_tax_status_code: 1,
        },
      }),
    ]);
  });

  it("audits a remedy that reports the document again with the remedy and the number, and no previous value", async () => {
    await store().transaction((tx) =>
      tx.recordRemedyAudit({ ...AUDIT, kind: "report", actorId, changes: [] }),
    );

    expect(await db.select().from(auditLog)).toEqual([
      expect.objectContaining({
        entityId: documentId,
        actorId,
        previousValue: null,
        newValue: { remedy: "report", number: 2 },
      }),
    ]);
  });

  it("keeps neither the remedy nor its audit when the operation fails after recording them", async () => {
    await expect(
      store().transaction(async (tx) => {
        await tx.recordRemedy({
          pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
          fortnight: OCTOBER_FIRST_HALF,
          documentType: "factura_c",
          number: 2,
          remedy: { kind: "report" },
          rejectedAt: REJECTED_AT,
          recordedAt: REMEDIED_AT,
        });
        await tx.recordRemedyAudit({ ...AUDIT, kind: "report", actorId, changes: [] });
        throw new Error("the operation failed");
      }),
    ).rejects.toThrow("the operation failed");

    expect(await db.select().from(rejectedDocumentRemedies)).toEqual([]);
    expect(await db.select().from(auditLog)).toEqual([]);
  });
});

describe("remedying a rejected document through the store", () => {
  const remedy = (remedyToApply: Parameters<typeof remedyRejectedDocument>[1]["remedy"]) =>
    remedyRejectedDocument(
      { store: store(), clock: { now: () => REMEDIED_AT } },
      {
        locationId,
        pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
        fortnightStart: OCTOBER_FIRST_HALF.start,
        documentType: "factura_c",
        number: 2,
        remedy: remedyToApply,
        actorId,
      },
    );

  it("records a correction for the rejection and its audit, and the presentation then reads the document corrected and awaiting its resend", async () => {
    await rejectDocumentTwo();

    const outcome = await remedy({ kind: "printed", correction: { issuedOn: "2026-10-02" } });

    expect(outcome).toEqual({ kind: "remedied" });
    expect(
      await store().transaction((tx) => tx.documentTypeReport(KEY, "factura_c", locationId)),
    ).toMatchObject({ remedy: { number: 2, rejectedAt: REJECTED_AT } });
    expect(await db.select().from(auditLog)).toEqual([
      expect.objectContaining({
        entityId: documentId,
        previousValue: { issued_on: "2026-10-01" },
        newValue: { issued_on: "2026-10-02" },
      }),
    ]);
    const documents = await store().transaction((tx) =>
      tx.documentsOn(OFFLINE_POINT_OF_SALE, OCTOBER_FIRST_HALF, locationId),
    );
    expect(documents.map(({ number, correction }) => [number, correction])).toEqual([
      [1, null],
      [2, { issuedOn: "2026-10-02" }],
    ]);
  });

  it("refuses a document the tax authority did not reject, leaving nothing recorded", async () => {
    expect(await remedy({ kind: "report" })).toEqual({ kind: "not_rejected" });
    expect(await db.select().from(rejectedDocumentRemedies)).toEqual([]);
    expect(await db.select().from(auditLog)).toEqual([]);
  });
});
