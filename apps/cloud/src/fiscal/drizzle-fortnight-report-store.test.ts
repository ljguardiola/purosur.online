import type { Fortnight } from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  fortnightDocumentReports,
  fortnightReports,
  pointOfSaleClaims,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleFortnightReportStore } from "./drizzle-fortnight-report-store.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { DrizzleOwedPresentationList } from "./drizzle-owed-presentation-list.js";
import { insertOfflineFiscalDocument } from "./test-support/offline-fiscal-document-fixtures.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";

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

function newStore() {
  return new DrizzleFortnightReportStore(db);
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
