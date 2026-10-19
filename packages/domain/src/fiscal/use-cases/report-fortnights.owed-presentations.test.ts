import { describe, expect, it } from "vitest";
import type { Fortnight } from "../model/offline-authorization-code.js";
import type { ListedOwedPresentation } from "../model/owed-presentation-list.js";
import { offlineDocument } from "./test-support/fake-fortnight-reports.js";
import {
  codeFor,
  ON_OCTOBER_3,
  POINT_OF_SALE,
  presentationOutcomes,
  REGISTER_ID,
  SEPTEMBER_SECOND_HALF,
  setUpReportFortnights,
  TOKEN,
} from "./test-support/report-fortnights.js";

const SEPTEMBER_FIRST_HALF: Fortnight = { start: "2026-09-01", end: "2026-09-15" };
const LISTED: ListedOwedPresentation = {
  pointOfSaleNumber: POINT_OF_SALE,
  fortnight: SEPTEMBER_SECOND_HALF,
};
const LISTED_FIRST_HALF: ListedOwedPresentation = {
  pointOfSaleNumber: POINT_OF_SALE,
  fortnight: SEPTEMBER_FIRST_HALF,
};
const LISTED_ELSEWHERE: ListedOwedPresentation = {
  pointOfSaleNumber: 99,
  fortnight: SEPTEMBER_FIRST_HALF,
};
const CLAIMED_AFTER_CLOSE = new Date("2026-10-02T12:00:00.000Z");
const REJECTIONS = [{ code: 1439, message: "El campo 'Importe Total' ImpTotal, debe ser igual" }];

function listed(overrides: Parameters<typeof setUpReportFortnights>[0] = {}) {
  const setup = setUpReportFortnights(overrides);
  setup.owedPresentations.entries = [LISTED];
  return setup;
}

function acceptedLocally(
  { reports }: ReturnType<typeof setUpReportFortnights>,
  movement: "none" | "documents",
) {
  reports.seed(LISTED, {
    state: "accepted",
    movement,
    lastAttemptAt: new Date("2026-10-01T12:00:00.000Z"),
  });
}

function freshDatabase() {
  const setup = setUpReportFortnights({ keptCode: false });
  setup.reports.pointsOfSale = [
    { pointOfSaleNumber: POINT_OF_SALE, registerId: REGISTER_ID, claimedAt: CLAIMED_AFTER_CLOSE },
  ];
  setup.owedPresentations.entries = [LISTED_ELSEWHERE];
  setup.codeAuthority.lookUpAnswer = (fortnight) =>
    fortnight.start === SEPTEMBER_FIRST_HALF.start
      ? { kind: "granted", code: codeFor(SEPTEMBER_FIRST_HALF) }
      : { kind: "no_answer" };
  return setup;
}

function documentsNumbered(...numbers: number[]) {
  return numbers.map((number) => offlineDocument(number));
}

function reportedNumbers(reports: { documents: { number: number }[] }[]) {
  return reports.map(({ documents }) => documents.map(({ number }) => number));
}

describe("reportFortnights, with the tax authority's list of owed presentations", () => {
  describe("recording the list", () => {
    it("records the list a code lookup answers with, at the moment it was answered", async () => {
      const { owedPresentations, codeAuthority, run } = setUpReportFortnights({
        keptCode: false,
      });
      codeAuthority.lookUpAnswer = () => ({
        kind: "no_answer",
        owedPresentations: [LISTED_ELSEWHERE],
      });

      await run();

      expect(owedPresentations.replacements).toEqual([
        { list: [LISTED_ELSEWHERE], at: ON_OCTOBER_3 },
      ]);
    });

    it("records the list a document report answers with", async () => {
      const { owedPresentations, documents, documentReports, run } = setUpReportFortnights();
      documents.add(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, offlineDocument(1));
      documentReports.reportAnswer = () => ({
        kind: "accepted",
        owedPresentations: [LISTED_ELSEWHERE],
      });

      await run();

      expect(owedPresentations.replacements).toEqual([
        { list: [LISTED_ELSEWHERE], at: ON_OCTOBER_3 },
      ]);
    });

    it("keeps the newest list when a later answer omits an entry of an earlier one", async () => {
      const { owedPresentations, documents, documentReports, codeAuthority, run } =
        setUpReportFortnights({ keptCode: false });
      codeAuthority.lookUpAnswer = (fortnight) => ({
        kind: "granted",
        code: codeFor(fortnight),
        owedPresentations: [LISTED_ELSEWHERE, LISTED],
      });
      documents.add(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, offlineDocument(1));
      documentReports.reportAnswer = () => ({
        kind: "accepted",
        owedPresentations: [LISTED_ELSEWHERE],
      });

      await run();

      expect(owedPresentations.replacements.map(({ list }) => list)).toEqual([
        [LISTED_ELSEWHERE, LISTED],
        [LISTED_ELSEWHERE],
      ]);
      expect(owedPresentations.entries).toEqual([LISTED_ELSEWHERE]);
    });

    it("leaves the list alone when no answer carries one", async () => {
      const { owedPresentations, documents, run } = setUpReportFortnights();
      owedPresentations.entries = [LISTED_ELSEWHERE];
      documents.add(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, offlineDocument(1));

      await run();

      expect(owedPresentations.replacements).toEqual([]);
      expect(owedPresentations.entries).toEqual([LISTED_ELSEWHERE]);
    });
  });

  describe("a presentation recorded locally as accepted", () => {
    it("is reopened and presented again when the list names it, sending only the documents the tax authority lacks", async () => {
      const setup = listed();
      const { documents, documentReports, owedPresentations, reports, run } = setup;
      acceptedLocally(setup, "documents");
      reports.seedReportedThrough(LISTED, "factura_c", 3);
      documents.add(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, ...documentsNumbered(1, 2, 3, 4, 5));
      documentReports.hold(POINT_OF_SALE, "factura_c", 3);

      const result = await run();

      expect(reportedNumbers(documentReports.reports)).toEqual([[4, 5]]);
      expect(presentationOutcomes(result).map(({ outcome }) => outcome)).toEqual([
        { kind: "accepted" },
      ]);
      expect(owedPresentations.resolutions).toEqual([{ key: LISTED, at: ON_OCTOBER_3 }]);
    });

    it("is not presented again when the list does not name it", async () => {
      const setup = setUpReportFortnights();
      acceptedLocally(setup, "none");

      await setup.run();

      expect(setup.declarations.lookUps).toEqual([]);
      expect(setup.declarations.declarations).toEqual([]);
    });

    it("sends nothing and is resolved when the tax authority holds the declaration", async () => {
      const setup = listed();
      acceptedLocally(setup, "none");
      setup.declarations.lookUpAnswer = () => ({ kind: "held" });

      const result = await setup.run();

      expect(presentationOutcomes(result).map(({ outcome }) => outcome)).toEqual([
        { kind: "already_declared" },
      ]);
      expect(setup.declarations.declarations).toEqual([]);
      expect(setup.documentReports.reports).toEqual([]);
      expect(setup.owedPresentations.resolutions).toEqual([{ key: LISTED, at: ON_OCTOBER_3 }]);
    });

    it("sends nothing and is resolved when the tax authority already holds every document", async () => {
      const setup = listed();
      acceptedLocally(setup, "documents");
      setup.documents.add(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, ...documentsNumbered(1, 2, 3));
      setup.documentReports.hold(POINT_OF_SALE, "factura_c", 3);

      await setup.run();

      expect(setup.documentReports.reports).toEqual([]);
      expect(setup.declarations.declarations).toEqual([]);
      expect(setup.owedPresentations.resolutions).toEqual([{ key: LISTED, at: ON_OCTOBER_3 }]);
    });

    it("is presented once, although it is both owed and accepted with unreported documents", async () => {
      const setup = listed();
      acceptedLocally(setup, "documents");
      setup.reports.seedReportedThrough(LISTED, "factura_c", 3);
      setup.documents.add(
        POINT_OF_SALE,
        SEPTEMBER_SECOND_HALF,
        ...documentsNumbered(1, 2, 3, 4, 5),
      );
      setup.documentReports.hold(POINT_OF_SALE, "factura_c", 3);

      const result = await setup.run();

      expect(presentationOutcomes(result)).toHaveLength(1);
      expect(setup.declarations.lookUps).toHaveLength(1);
    });
  });

  describe("a presentation of a point of sale the system does not own", () => {
    it("is never presented, and no code is looked up for its fortnight", async () => {
      const setup = setUpReportFortnights({ keptCode: false });
      setup.owedPresentations.entries = [
        { pointOfSaleNumber: 99, fortnight: SEPTEMBER_FIRST_HALF },
      ];

      const result = await setup.run();

      expect(result).toEqual({ kind: "reported", presentations: [] });
      expect(setup.codeAuthority.lookUps.map(({ fortnight }) => fortnight)).toEqual([
        SEPTEMBER_SECOND_HALF,
      ]);
      expect(setup.declarations.lookUps).toEqual([]);
      expect(setup.declarations.declarations).toEqual([]);
      expect(setup.documentReports.lastReportedCalls).toEqual([]);
    });

    it("leaves the owned points of sale to be presented as usual", async () => {
      const setup = setUpReportFortnights();
      setup.owedPresentations.entries = [
        { pointOfSaleNumber: 99, fortnight: SEPTEMBER_SECOND_HALF },
      ];

      await setup.run();

      expect(setup.declarations.lookUps.map(({ pointOfSaleNumber }) => pointOfSaleNumber)).toEqual([
        POINT_OF_SALE,
      ]);
    });
  });

  describe("on a database that holds nothing of the fortnight", () => {
    it("recovers the fortnight's code from the list and attempts the presentation, whatever the point of sale's claim date", async () => {
      const { codeAuthority, codeStore, declarations, run } = freshDatabase();

      const result = await run();

      expect(codeAuthority.lookUps.map(({ fortnight }) => fortnight.start)).toContain(
        SEPTEMBER_FIRST_HALF.start,
      );
      expect(codeStore.kept).toEqual([
        expect.objectContaining({
          code: codeFor(SEPTEMBER_FIRST_HALF),
          obtainedAt: ON_OCTOBER_3,
          obtainedThrough: "recovered",
        }),
      ]);
      expect(declarations.lookUps).toEqual([
        {
          token: TOKEN,
          pointOfSaleNumber: POINT_OF_SALE,
          code: "code-2026-09-01",
          heldDuringCall: true,
        },
      ]);
      expect(presentationOutcomes(result)).toHaveLength(1);
    });

    it("recovers the code under the fortnight's acquisition hold", async () => {
      const { codeAuthority, run } = freshDatabase();

      await run();

      expect(
        codeAuthority.lookUps
          .filter(({ fortnight }) => fortnight.start === SEPTEMBER_FIRST_HALF.start)
          .map(({ heldDuringCall }) => heldDuringCall),
      ).toEqual([true]);
    });

    it.each([0, 9])(
      "stays owed when the register's stream is unproven, whatever the %s documents the tax authority holds",
      async (heldNumber) => {
        const setup = freshDatabase();
        setup.streams.installations.set(REGISTER_ID, []);
        setup.documentReports.hold(POINT_OF_SALE, "factura_c", heldNumber);

        const result = await setup.run();

        expect(presentationOutcomes(result).map(({ outcome }) => outcome)).toEqual([
          { kind: "blocked" },
        ]);
        expect(setup.owedPresentations.resolutions).toEqual([]);
        expect(setup.owedPresentations.entries).toEqual([LISTED_FIRST_HALF]);
      },
    );

    it.each([
      ["refuses the declaration", { kind: "refused", rejections: REJECTIONS }],
      ["does not answer the declaration", { kind: "no_answer" }],
    ] as const)(
      "stays owed when the tax authority %s of a fortnight with no local documents",
      async (_name, answer) => {
        const setup = freshDatabase();
        setup.documentReports.hold(POINT_OF_SALE, "factura_c", 9);
        setup.declarations.declareAnswer = () => answer;

        await setup.run();

        expect(setup.owedPresentations.resolutions).toEqual([]);
      },
    );

    it("is resolved once the tax authority accepts the declaration of no movement", async () => {
      const setup = freshDatabase();

      await setup.run();

      expect(setup.declarations.declarations).toHaveLength(1);
      expect(setup.owedPresentations.resolutions).toEqual([
        { key: LISTED_FIRST_HALF, at: ON_OCTOBER_3 },
      ]);
    });
  });

  describe("a listed presentation the tax authority does not confirm", () => {
    function listedWithDocuments() {
      const setup = listed();
      setup.documents.add(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, ...documentsNumbered(1, 2, 3));
      return setup;
    }

    it("is resolved when the tax authority accepts the documents sent", async () => {
      const setup = listedWithDocuments();

      await setup.run();

      expect(reportedNumbers(setup.documentReports.reports)).toEqual([[1, 2, 3]]);
      expect(setup.owedPresentations.resolutions).toEqual([{ key: LISTED, at: ON_OCTOBER_3 }]);
    });

    it("stays owed when the register's stream is unproven", async () => {
      const setup = listedWithDocuments();
      setup.streams.installations.set(REGISTER_ID, []);
      setup.documentReports.hold(POINT_OF_SALE, "factura_c", 3);

      await setup.run();

      expect(setup.documentReports.lastReportedCalls).toEqual([]);
      expect(setup.owedPresentations.resolutions).toEqual([]);
    });

    it("stays owed when the tax authority rejects a document", async () => {
      const setup = listedWithDocuments();
      setup.documentReports.reportAnswer = () => ({
        kind: "rejected",
        number: 2,
        rejections: REJECTIONS,
      });

      await setup.run();

      expect(setup.owedPresentations.resolutions).toEqual([]);
    });

    it("stays owed when the tax authority refuses the documents", async () => {
      const setup = listedWithDocuments();
      setup.documentReports.reportAnswer = () => ({ kind: "refused", rejections: REJECTIONS });

      await setup.run();

      expect(setup.owedPresentations.resolutions).toEqual([]);
    });

    it("stays owed when the tax authority does not answer the documents", async () => {
      const setup = listedWithDocuments();
      setup.documentReports.reportAnswer = () => ({ kind: "no_answer" });

      await setup.run();

      expect(setup.owedPresentations.resolutions).toEqual([]);
    });

    it("stays owed when a document is missing from the numbering", async () => {
      const setup = listed();
      setup.documents.add(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, ...documentsNumbered(2, 3));

      await setup.run();

      expect(setup.owedPresentations.resolutions).toEqual([]);
    });

    it("stays owed when the tax authority's last reported number cannot be read", async () => {
      const setup = listedWithDocuments();
      setup.documentReports.lastReportedAnswer = () => ({ kind: "no_answer" });

      await setup.run();

      expect(setup.owedPresentations.resolutions).toEqual([]);
    });

    it("stays owed when the tax authority refuses to say whether it holds the declaration", async () => {
      const setup = listed();
      setup.declarations.lookUpAnswer = () => ({ kind: "refused", rejections: REJECTIONS });

      await setup.run();

      expect(setup.owedPresentations.resolutions).toEqual([]);
    });

    it("stays owed when the tax authority does not answer whether it holds the declaration", async () => {
      const setup = listed();
      setup.declarations.lookUpAnswer = () => ({ kind: "no_answer" });

      await setup.run();

      expect(setup.owedPresentations.resolutions).toEqual([]);
    });
  });
});
