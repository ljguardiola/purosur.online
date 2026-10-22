import type { Fortnight } from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  creditNotes,
  fortnightDocumentReports,
  fortnightReports,
  pointOfSaleClaims,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleFortnightReportStore } from "./drizzle-fortnight-report-store.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { DrizzleOwedPresentationList } from "./drizzle-owed-presentation-list.js";
import { insertOfflineFiscalDocument } from "./test-support/offline-fiscal-document-fixtures.js";
import {
  retireOfflinePointOfSaleAt,
  seedOfflinePointOfSale,
} from "./test-support/offline-point-of-sale-fixtures.js";
import { insertRejectedDocumentRemedy } from "./test-support/rejected-document-remedy-fixtures.js";

const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const OCTOBER_SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };
const OFFLINE_POINT_OF_SALE = 8;
const KEY = { pointOfSaleNumber: OFFLINE_POINT_OF_SALE, fortnight: OCTOBER_FIRST_HALF };
const AT = new Date("2026-10-16T12:00:00.000Z");

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
  enqueuedCreditNotes.length = 0;
});

async function keepCode(fortnight: Fortnight, code: string) {
  await new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(fortnight, (acquisition) =>
    acquisition.keep({
      code: { code, fortnight, reportDeadline: "2026-10-20" },
      obtainedAt: new Date("2026-09-28T12:00:00.000Z"),
      obtainedThrough: "requested",
    }),
  );
}

async function claimedAt(claimedAtInstant: Date) {
  await testDatabase.asMigrator(() =>
    db
      .update(pointOfSaleClaims)
      .set({ claimedAt: claimedAtInstant })
      .where(eq(pointOfSaleClaims.pointOfSaleNumber, OFFLINE_POINT_OF_SALE)),
  );
}

function listedAsOwed(pointOfSaleNumber: number, fortnight: Fortnight) {
  return new DrizzleOwedPresentationList(db).replace([{ pointOfSaleNumber, fortnight }], AT);
}

const enqueuedCreditNotes: string[] = [];

function newStore(
  enqueueCreditNote = async (_: unknown, creditNoteId: string) => {
    enqueuedCreditNotes.push(creditNoteId);
  },
) {
  return new DrizzleFortnightReportStore(db, { enqueueCreditNote, now: () => AT });
}

describe("DrizzleFortnightReportStore.owedReports", () => {
  it("owes a closed fortnight's kept code for each offline point of sale claimed before it closed, with its register", async () => {
    const registerId = await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-09-20T12:00:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");

    expect(await newStore().owedReports("2026-10-16")).toEqual([
      {
        pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
        registerId,
        code: {
          code: "36123456789012",
          fortnight: OCTOBER_FIRST_HALF,
          reportDeadline: "2026-10-20",
        },
      },
    ]);
  });

  it("owes nothing for the real-time point of sale", async () => {
    await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-09-20T12:00:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");

    expect(
      (await newStore().owedReports("2026-10-16")).map(
        ({ pointOfSaleNumber }) => pointOfSaleNumber,
      ),
    ).toEqual([OFFLINE_POINT_OF_SALE]);
  });

  it("owes nothing for a fortnight that has not closed by the given day", async () => {
    await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-09-20T12:00:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");

    expect(await newStore().owedReports("2026-10-15")).toEqual([]);
  });

  it("owes nothing for a point of sale claimed after the fortnight closed", async () => {
    await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-10-16T03:00:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");

    expect(await newStore().owedReports("2026-10-17")).toEqual([]);
  });

  it("owes a point of sale claimed before the close even in the last hours of the fortnight", async () => {
    await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-10-16T02:59:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");

    expect(await newStore().owedReports("2026-10-17")).toHaveLength(1);
  });

  it("owes each closed fortnight's code separately", async () => {
    await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-09-20T12:00:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
    await keepCode(OCTOBER_SECOND_HALF, "36123456789013");

    const owed = await newStore().owedReports("2026-11-01");

    expect(owed.map(({ code }) => code.code).sort()).toEqual(["36123456789012", "36123456789013"]);
  });

  it("stops owing a presentation recorded as accepted but keeps owing one in any other state", async () => {
    await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-09-20T12:00:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
    await keepCode(OCTOBER_SECOND_HALF, "36123456789013");
    const store = newStore();
    await store.holdReport(KEY, (report) => report.record({ state: "accepted", at: AT }));
    await store.holdReport(
      { pointOfSaleNumber: OFFLINE_POINT_OF_SALE, fortnight: OCTOBER_SECOND_HALF },
      (report) => report.record({ state: "blocked", at: AT }),
    );

    const owed = await store.owedReports("2026-11-01");

    expect(owed.map(({ code }) => code.code)).toEqual(["36123456789013"]);
  });
});

describe("DrizzleFortnightReportStore.owedReports for a retired point of sale", () => {
  it("owes the fortnights that closed before the retirement and none that close after it", async () => {
    await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-09-20T12:00:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
    await keepCode(OCTOBER_SECOND_HALF, "36123456789013");
    await retireOfflinePointOfSaleAt(db, OFFLINE_POINT_OF_SALE, AT);

    const owed = await newStore().owedReports("2026-11-10");

    expect(owed.map(({ code }) => code.code)).toEqual(["36123456789012"]);
  });
});

describe("DrizzleFortnightReportStore.owedReports for the presentations the tax authority lists as owed", () => {
  it("owes a listed presentation recorded as accepted", async () => {
    await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-09-20T12:00:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
    const store = newStore();
    await store.holdReport(KEY, (report) => report.record({ state: "accepted", at: AT }));
    await listedAsOwed(OFFLINE_POINT_OF_SALE, OCTOBER_FIRST_HALF);

    const owed = await store.owedReports("2026-11-01");

    expect(owed.map(({ code }) => code.code)).toEqual(["36123456789012"]);
  });

  it("owes a listed presentation of a point of sale claimed after the fortnight closed", async () => {
    await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-10-20T12:00:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
    await listedAsOwed(OFFLINE_POINT_OF_SALE, OCTOBER_FIRST_HALF);

    expect((await newStore().owedReports("2026-11-01")).map(({ code }) => code.code)).toEqual([
      "36123456789012",
    ]);
  });

  it("owes nothing for a listed presentation whose code is not kept yet", async () => {
    await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-09-20T12:00:00.000Z"));
    await listedAsOwed(OFFLINE_POINT_OF_SALE, OCTOBER_FIRST_HALF);

    expect(await newStore().owedReports("2026-11-01")).toEqual([]);
  });

  it("owes nothing for a presentation listed for a point of sale the system does not own", async () => {
    await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-10-20T12:00:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
    await listedAsOwed(9, OCTOBER_FIRST_HALF);

    expect(await newStore().owedReports("2026-11-01")).toEqual([]);
  });

  it("owes nothing for a listed presentation of the real-time point of sale", async () => {
    await seedOfflinePointOfSale(db);
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
    await listedAsOwed(7, OCTOBER_FIRST_HALF);

    expect(await newStore().owedReports("2026-11-01")).toEqual([]);
  });

  it("owes nothing for a listed presentation of a fortnight that has not closed", async () => {
    await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-10-20T12:00:00.000Z"));
    await keepCode(OCTOBER_SECOND_HALF, "36123456789013");
    await listedAsOwed(OFFLINE_POINT_OF_SALE, OCTOBER_SECOND_HALF);

    expect(await newStore().owedReports("2026-10-20")).toEqual([]);
  });
});

describe("DrizzleFortnightReportStore.holdReport", () => {
  beforeEach(async () => {
    await seedOfflinePointOfSale(db);
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
  });

  it("recalls nothing for a presentation that was never recorded", async () => {
    expect(await newStore().holdReport(KEY, (report) => report.recorded())).toBeNull();
  });

  it("returns what the work returned", async () => {
    expect(await newStore().holdReport(KEY, async () => "worked")).toBe("worked");
  });

  it.each(["blocked", "missing_document"] as const)(
    "records a presentation that is %s without an attempt time",
    async (state) => {
      await newStore().holdReport(KEY, (report) => report.record({ state, at: AT }));

      expect(await newStore().holdReport(KEY, (report) => report.recorded())).toEqual({
        state,
        movement: null,
        lastAttemptAt: null,
      });
    },
  );

  it.each(["submitting", "refused", "accepted"] as const)(
    "takes the time of a %s change as the time of the last attempt",
    async (state) => {
      await newStore().holdReport(KEY, (report) => report.record({ state, at: AT }));

      expect(await newStore().holdReport(KEY, (report) => report.recorded())).toEqual({
        state,
        movement: null,
        lastAttemptAt: AT,
      });
    },
  );

  it("keeps the time of the last attempt when a later change is not an attempt", async () => {
    const store = newStore();
    const later = new Date("2026-10-16T15:00:00.000Z");
    await store.holdReport(KEY, async (report) => {
      await report.record({ state: "refused", at: AT });
      await report.record({ state: "blocked", at: later });
    });

    expect(await store.holdReport(KEY, (report) => report.recorded())).toEqual({
      state: "blocked",
      movement: null,
      lastAttemptAt: AT,
    });
  });

  it("keeps the rejections of a refusal with the change's time, and clears them once accepted", async () => {
    const store = newStore();
    const rejections = [{ code: 1202, message: "Fictional rejection" }];

    await store.holdReport(KEY, (report) =>
      report.record({ state: "refused", at: AT, rejections }),
    );
    expect(await db.select().from(fortnightReports)).toEqual([
      {
        pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
        fortnightStart: "2026-10-01",
        fortnightEnd: "2026-10-15",
        state: "refused",
        movement: null,
        lastAttemptAt: AT,
        rejections,
        recordedAt: AT,
      },
    ]);

    const accepted = new Date("2026-10-16T14:00:00.000Z");
    await store.holdReport(KEY, (report) => report.record({ state: "accepted", at: accepted }));
    expect(await db.select().from(fortnightReports)).toEqual([
      expect.objectContaining({ state: "accepted", rejections: null, recordedAt: accepted }),
    ]);
  });

  it.each(["none", "documents"] as const)(
    "recalls the %s movement an accepted change recorded, and forgets it when a later change gives none",
    async (movement) => {
      const store = newStore();

      await store.holdReport(KEY, (report) =>
        report.record({ state: "accepted", at: AT, movement }),
      );
      expect(await store.holdReport(KEY, (report) => report.recorded())).toEqual({
        state: "accepted",
        movement,
        lastAttemptAt: AT,
      });

      await store.holdReport(KEY, (report) =>
        report.record({ state: "needs_regularization", at: AT }),
      );
      expect(await store.holdReport(KEY, (report) => report.recorded())).toEqual({
        state: "needs_regularization",
        movement: null,
        lastAttemptAt: AT,
      });
    },
  );
});

describe("DrizzleFortnightReportStore document type reports", () => {
  const FACTURA_C = "factura_c" as const;

  beforeEach(async () => {
    await seedOfflinePointOfSale(db);
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
  });

  it("records the progress of a document type with the time of the change", async () => {
    await newStore().holdReport(KEY, (report) =>
      report.recordDocumentType({
        documentType: FACTURA_C,
        state: "missing_document",
        at: AT,
        reportedThrough: 4,
      }),
    );

    expect(await db.select().from(fortnightDocumentReports)).toEqual([
      {
        pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
        fortnightStart: "2026-10-01",
        fortnightEnd: "2026-10-15",
        documentType: FACTURA_C,
        state: "missing_document",
        reportedThrough: 4,
        rejectedNumber: null,
        rejections: null,
        lastAttemptAt: null,
        recordedAt: AT,
      },
    ]);
  });

  it.each(["submitting", "refused", "accepted"] as const)(
    "takes the time of a %s change as the time of the document type's last attempt",
    async (state) => {
      await newStore().holdReport(KEY, (report) =>
        report.recordDocumentType({
          documentType: FACTURA_C,
          state,
          at: AT,
          reportedThrough: 4,
        }),
      );

      expect(await db.select().from(fortnightDocumentReports)).toEqual([
        expect.objectContaining({ state, lastAttemptAt: AT }),
      ]);
    },
  );

  it("keeps the rejected document and its rejections, and replaces the same document type's row on the next change", async () => {
    const store = newStore();
    const rejections = [{ code: 1439, message: "Fictional observation" }];
    await store.holdReport(KEY, (report) =>
      report.recordDocumentType({
        documentType: FACTURA_C,
        state: "refused",
        at: AT,
        reportedThrough: 4,
        rejectedNumber: 5,
        rejections,
      }),
    );
    expect(await db.select().from(fortnightDocumentReports)).toEqual([
      expect.objectContaining({ state: "refused", rejectedNumber: 5, rejections }),
    ]);

    const later = new Date("2026-10-16T14:00:00.000Z");
    await store.holdReport(KEY, (report) =>
      report.recordDocumentType({
        documentType: FACTURA_C,
        state: "accepted",
        at: later,
        reportedThrough: 9,
      }),
    );

    expect(await db.select().from(fortnightDocumentReports)).toEqual([
      expect.objectContaining({
        state: "accepted",
        reportedThrough: 9,
        rejectedNumber: null,
        rejections: null,
        recordedAt: later,
      }),
    ]);
  });
});

describe("DrizzleFortnightReportStore.acceptedWithUnreportedDocuments", () => {
  let registerId: string;

  beforeEach(async () => {
    registerId = await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-09-20T12:00:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
  });

  async function document(number: number) {
    await insertOfflineFiscalDocument(db, {
      registerId,
      pointOfSale: OFFLINE_POINT_OF_SALE,
      fortnight: OCTOBER_FIRST_HALF,
      number,
    });
  }

  function accept(movement: "none" | "documents" | undefined, reportedThrough?: number) {
    return newStore().holdReport(KEY, async (report) => {
      await report.record({
        state: "accepted",
        at: AT,
        ...(movement === undefined ? {} : { movement }),
      });
      if (reportedThrough !== undefined) {
        await report.recordDocumentType({
          documentType: "factura_c",
          state: "accepted",
          at: AT,
          reportedThrough,
        });
      }
    });
  }

  it.each(["none", "documents"] as const)(
    "lists an accepted presentation with %s movement that holds a document its type has not reported, as owed reports are listed",
    async (movement) => {
      await document(3);
      await accept(movement, 2);

      expect(await newStore().acceptedWithUnreportedDocuments()).toEqual([
        {
          pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
          registerId,
          code: {
            code: "36123456789012",
            fortnight: OCTOBER_FIRST_HALF,
            reportDeadline: "2026-10-20",
          },
        },
      ]);
    },
  );

  it("lists an accepted presentation whose document type has no report at all", async () => {
    await document(1);
    await accept("none");

    expect(await newStore().acceptedWithUnreportedDocuments()).toHaveLength(1);
  });

  it("lists nothing when every document is reported through its type's last reported number", async () => {
    await document(1);
    await document(2);
    await accept("documents", 2);

    expect(await newStore().acceptedWithUnreportedDocuments()).toEqual([]);
  });

  it("lists nothing for an accepted presentation without documents", async () => {
    await accept("none");

    expect(await newStore().acceptedWithUnreportedDocuments()).toEqual([]);
  });

  it("lists nothing for an accepted presentation whose movement was never recorded", async () => {
    await document(1);
    await accept(undefined);

    expect(await newStore().acceptedWithUnreportedDocuments()).toEqual([]);
  });

  it.each([
    "blocked",
    "missing_document",
    "submitting",
    "refused",
    "needs_regularization",
  ] as const)("lists nothing for a presentation recorded as %s", async (state) => {
    await document(1);
    await newStore().holdReport(KEY, (report) =>
      report.record({ state, at: AT, movement: "documents" }),
    );

    expect(await newStore().acceptedWithUnreportedDocuments()).toEqual([]);
  });
});

describe("DrizzleFortnightReportStore.withReportedCorrectionsAwaitingCredit", () => {
  let registerId: string;

  beforeEach(async () => {
    registerId = await seedOfflinePointOfSale(db);
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
    for (const number of [1, 2, 3]) {
      await insertOfflineFiscalDocument(db, {
        registerId,
        pointOfSale: OFFLINE_POINT_OF_SALE,
        fortnight: OCTOBER_FIRST_HALF,
        number,
      });
    }
  });

  function reportedThrough(number: number) {
    return newStore().holdReport(KEY, (report) =>
      report.recordDocumentType({
        documentType: "factura_c",
        state: "accepted",
        at: AT,
        reportedThrough: number,
      }),
    );
  }

  function correct(number: number, correction: { total: number } | null = { total: 9_900 }) {
    return insertRejectedDocumentRemedy(db, {
      pointOfSale: OFFLINE_POINT_OF_SALE,
      fortnight: OCTOBER_FIRST_HALF,
      number,
      correction,
      rejectedAt: AT,
      recordedAt: AT,
    });
  }

  it("lists a presentation whose corrected document the tax authority holds and that has no credit note yet, as owed reports are listed", async () => {
    await correct(2);
    await reportedThrough(3);

    expect(await newStore().withReportedCorrectionsAwaitingCredit()).toEqual([
      {
        pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
        registerId,
        code: {
          code: "36123456789012",
          fortnight: OCTOBER_FIRST_HALF,
          reportDeadline: "2026-10-20",
        },
      },
    ]);
  });

  it("lists nothing while the tax authority does not hold the corrected document yet", async () => {
    await correct(3);
    await reportedThrough(2);

    expect(await newStore().withReportedCorrectionsAwaitingCredit()).toEqual([]);
  });

  it("lists nothing for a document reported again without a correction", async () => {
    await correct(2, null);
    await reportedThrough(3);

    expect(await newStore().withReportedCorrectionsAwaitingCredit()).toEqual([]);
  });

  it("lists nothing once the corrected document has a credit note", async () => {
    await correct(2);
    await reportedThrough(3);
    await newStore().holdReport(KEY, (report) =>
      report.creditCorrectedDocument({
        saleId: "0199b7a0-0000-7000-8000-000000000004",
        reason: "rejected_document",
        pointOfSale: 7,
        associatedVoucher: { voucherType: 11, pointOfSale: OFFLINE_POINT_OF_SALE, number: 2 },
        total: 9_900,
        receiverTaxStatusCode: 5,
      }),
    );

    expect(await newStore().withReportedCorrectionsAwaitingCredit()).toEqual([]);
  });
});

describe("DrizzleFortnightReportStore.documentTypeReports", () => {
  const rejections = [{ code: 1439, message: "Fictional observation" }];

  beforeEach(async () => {
    await seedOfflinePointOfSale(db);
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
  });

  function refuseAt(number: number, fortnight: Fortnight = OCTOBER_FIRST_HALF) {
    return newStore().holdReport(
      { pointOfSaleNumber: OFFLINE_POINT_OF_SALE, fortnight },
      (report) =>
        report.recordDocumentType({
          documentType: "factura_c",
          state: "refused",
          at: AT,
          reportedThrough: number - 1,
          rejectedNumber: number,
          rejections,
        }),
    );
  }

  function documentTypeReports() {
    return newStore().holdReport(KEY, (report) => report.documentTypeReports());
  }

  it("recalls no document type report for a presentation that recorded none", async () => {
    expect(await documentTypeReports()).toEqual([]);
  });

  it("recalls a document type's progress, its rejected document and rejections, and that no remedy was recorded", async () => {
    await refuseAt(5);

    expect(await documentTypeReports()).toEqual([
      {
        documentType: "factura_c",
        state: "refused",
        reportedThrough: 4,
        rejectedNumber: 5,
        lastAttemptAt: AT,
        rejections,
        remedy: null,
      },
    ]);
  });

  it("recalls no rejections for a document type recorded without any", async () => {
    await newStore().holdReport(KEY, (report) =>
      report.recordDocumentType({
        documentType: "factura_c",
        state: "accepted",
        at: AT,
        reportedThrough: 9,
      }),
    );

    expect(await documentTypeReports()).toEqual([
      expect.objectContaining({ rejections: [], rejectedNumber: null, remedy: null }),
    ]);
  });

  it("recalls the remedy recorded for the rejection the document type holds, not one recorded later for an earlier rejection", async () => {
    await refuseAt(5);
    const remedy = (rejectedAt: Date, recordedAt: string) =>
      insertRejectedDocumentRemedy(db, {
        pointOfSale: OFFLINE_POINT_OF_SALE,
        fortnight: OCTOBER_FIRST_HALF,
        number: 5,
        correction: null,
        rejectedAt,
        recordedAt: new Date(recordedAt),
      });
    await remedy(AT, "2026-10-17T10:00:00.000Z");
    await remedy(new Date(AT.getTime() - 60_000), "2026-10-18T10:00:00.000Z");

    expect(await documentTypeReports()).toEqual([
      expect.objectContaining({ remedy: { number: 5, rejectedAt: AT } }),
    ]);
  });

  it("recalls no remedy while the only one recorded is for another rejection of the document", async () => {
    await refuseAt(5);
    await insertRejectedDocumentRemedy(db, {
      pointOfSale: OFFLINE_POINT_OF_SALE,
      fortnight: OCTOBER_FIRST_HALF,
      number: 5,
      correction: null,
      rejectedAt: new Date(AT.getTime() + 60_000),
      recordedAt: new Date("2026-10-17T10:00:00.000Z"),
    });

    expect(await documentTypeReports()).toEqual([expect.objectContaining({ remedy: null })]);
  });

  it("recalls no remedy of another document, of another point of sale or of another fortnight", async () => {
    await refuseAt(5);
    await keepCode(OCTOBER_SECOND_HALF, "36123456789013");
    await refuseAt(5, OCTOBER_SECOND_HALF);
    const otherRemedies = [
      { pointOfSale: OFFLINE_POINT_OF_SALE, fortnight: OCTOBER_FIRST_HALF, number: 4 },
      { pointOfSale: 7, fortnight: OCTOBER_FIRST_HALF, number: 5 },
      { pointOfSale: OFFLINE_POINT_OF_SALE, fortnight: OCTOBER_SECOND_HALF, number: 5 },
    ];
    for (const other of otherRemedies) {
      await insertRejectedDocumentRemedy(db, {
        ...other,
        correction: null,
        rejectedAt: AT,
        recordedAt: new Date("2026-10-17T10:00:00.000Z"),
      });
    }

    expect(await documentTypeReports()).toEqual([expect.objectContaining({ remedy: null })]);
  });
});

describe("DrizzleFortnightReportStore.realTimePointOfSaleOf", () => {
  it("answers the real-time point of sale a register holds, and none for a register that holds none", async () => {
    const registerId = await seedOfflinePointOfSale(db);
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
    const store = newStore();

    expect(await store.holdReport(KEY, (report) => report.realTimePointOfSaleOf(registerId))).toBe(
      7,
    );
    expect(
      await store.holdReport(KEY, (report) =>
        report.realTimePointOfSaleOf("0199b7a0-0000-7000-8000-0000000000ff"),
      ),
    ).toBeNull();
  });
});

describe("DrizzleFortnightReportStore.creditCorrectedDocument", () => {
  const creditNote = {
    saleId: "0199b7a0-0000-7000-8000-000000000004",
    reason: "rejected_document",
    pointOfSale: 7,
    associatedVoucher: { voucherType: 11, pointOfSale: OFFLINE_POINT_OF_SALE, number: 5 },
    total: 12_500,
    receiverTaxStatusCode: 5,
  } as const;
  let registerId: string;

  beforeEach(async () => {
    registerId = await seedOfflinePointOfSale(db);
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
  });

  function credit(store = newStore()) {
    return store.holdReport(KEY, (report) => report.creditCorrectedDocument(creditNote));
  }

  it("asks for a credit note of the corrected document's whole total on the register's real-time point of sale, and queues its issuing", async () => {
    await credit();

    const rows = await db.select().from(creditNotes);
    expect(rows).toEqual([
      expect.objectContaining({
        registerId,
        saleId: creditNote.saleId,
        reason: "rejected_document",
        pointOfSale: 7,
        associatedVoucherType: 11,
        associatedPointOfSale: OFFLINE_POINT_OF_SALE,
        associatedNumber: 5,
        keptVoucherType: null,
        total: 12_500,
        receiverTaxStatusCode: 5,
        number: null,
        answerKind: null,
        createdAt: AT,
      }),
    ]);
    expect(enqueuedCreditNotes).toEqual([rows[0]?.id]);
  });

  it("asks for the credit note once, however many times the corrected document is credited", async () => {
    await credit();
    await credit();

    expect(await db.select().from(creditNotes)).toHaveLength(1);
    expect(enqueuedCreditNotes).toHaveLength(1);
  });

  it("asks for nothing when the corrected voucher already has a credit note, such as the one of a voided sale", async () => {
    await db.insert(creditNotes).values({
      id: "0199b7a0-0000-7000-8000-000000000009",
      registerId,
      saleId: creditNote.saleId,
      reason: "sale_void",
      pointOfSale: 7,
      associatedVoucherType: 11,
      associatedPointOfSale: OFFLINE_POINT_OF_SALE,
      associatedNumber: 5,
      total: 12_500,
      receiverTaxStatusCode: 5,
      createdAt: AT,
    });

    await credit();

    expect(await db.select({ id: creditNotes.id }).from(creditNotes)).toEqual([
      { id: "0199b7a0-0000-7000-8000-000000000009" },
    ]);
    expect(enqueuedCreditNotes).toEqual([]);
  });

  it("leaves no credit note behind when queuing its issuing fails", async () => {
    const failing = newStore(async () => {
      throw new Error("the queue is down");
    });

    await expect(credit(failing)).rejects.toThrow("the queue is down");

    expect(await db.select().from(creditNotes)).toEqual([]);
  });

  it("asks for a credit note of another voucher separately", async () => {
    await credit();
    await newStore().holdReport(KEY, (report) =>
      report.creditCorrectedDocument({
        ...creditNote,
        associatedVoucher: { ...creditNote.associatedVoucher, number: 6 },
      }),
    );

    expect(await db.select().from(creditNotes)).toHaveLength(2);
  });
});
