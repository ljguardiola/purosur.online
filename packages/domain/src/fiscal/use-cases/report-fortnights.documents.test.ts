import { describe, expect, it } from "vitest";
import { offlineDocument } from "./test-support/fake-fortnight-reports.js";
import {
  CLAIMED_AT,
  codeFor,
  KEY,
  ON_OCTOBER_3,
  ON_OCTOBER_20,
  POINT_OF_SALE,
  presentationOutcomes,
  REGISTER_ID,
  reachingInstallation,
  SEPTEMBER_SECOND_HALF,
  setUpReportFortnights,
  TOKEN,
} from "./test-support/report-fortnights.js";

const PRESENTATION = { pointOfSaleNumber: POINT_OF_SALE, fortnight: SEPTEMBER_SECOND_HALF };
const REJECTIONS = [{ code: 1439, message: "El campo 'Importe Total' ImpTotal, debe ser igual" }];

function documentsNumbered(...numbers: number[]) {
  return numbers.map((number) => offlineDocument(number));
}

function setUp({
  numbers = [1, 2, 3],
  now = ON_OCTOBER_3,
}: {
  numbers?: number[];
  now?: Date;
} = {}) {
  const setup = setUpReportFortnights({ now });
  setup.documents.add(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, ...documentsNumbered(...numbers));
  return setup;
}

function reportedNumbers(reports: { documents: { number: number }[] }[]) {
  return reports.map(({ documents }) => documents.map(({ number }) => number));
}

describe("reportFortnights, for a fortnight with offline-authorized documents", () => {
  describe("reporting the documents", () => {
    it("asks what the tax authority holds and how many fit in a batch, records the attempt, sends them and records the acceptance", async () => {
      const { operations, documentReports, run } = setUp();

      const result = await run();

      expect(presentationOutcomes(result)).toEqual([
        {
          pointOfSaleNumber: POINT_OF_SALE,
          fortnight: SEPTEMBER_SECOND_HALF,
          documentType: "factura_c",
          outcome: { kind: "accepted" },
        },
      ]);
      expect(operations).toEqual([
        "owedReports",
        `hold ${KEY}`,
        "tax authority lookUp",
        "installationsOf",
        "documentsOn",
        "tax authority lastReported factura_c",
        "tax authority batchLimit",
        "record factura_c submitting",
        "tax authority report factura_c",
        "tax authority lastReported factura_c",
        "record factura_c accepted",
        "record accepted",
        `release ${KEY}`,
        "acceptedWithUnreportedDocuments",
      ]);
      expect(documentReports.reports).toEqual([
        {
          token: TOKEN,
          pointOfSaleNumber: POINT_OF_SALE,
          documentType: "factura_c",
          code: "code-2026-09-16",
          documents: documentsNumbered(1, 2, 3),
          heldDuringCall: true,
        },
      ]);
    });

    it("records each document type's presentation with the last number it reported, and the fortnight as accepted with documents", async () => {
      const { reports, run } = setUp();

      await run();

      expect(reports.documentTypeChanges.map(({ change }) => change)).toEqual([
        { documentType: "factura_c", state: "submitting", at: ON_OCTOBER_3, reportedThrough: 0 },
        { documentType: "factura_c", state: "accepted", at: ON_OCTOBER_3, reportedThrough: 3 },
      ]);
      expect(reports.changes.map(({ change }) => change)).toStrictEqual([
        { state: "accepted", at: ON_OCTOBER_3, movement: "documents" },
      ]);
    });

    it("is a presentation of its own for each point of sale that had documents", async () => {
      const { reports, documents, streams, documentReports, declarations, run } = setUp();
      reports.pointsOfSale = [
        { pointOfSaleNumber: POINT_OF_SALE, registerId: REGISTER_ID, claimedAt: CLAIMED_AT },
        { pointOfSaleNumber: 8, registerId: "register-2", claimedAt: CLAIMED_AT },
      ];
      streams.installations.set("register-2", [reachingInstallation()]);
      documents.add(8, SEPTEMBER_SECOND_HALF, ...documentsNumbered(10, 11));
      documentReports.hold(8, "factura_c", 9);

      const result = await run();

      expect(
        presentationOutcomes(result).map(({ pointOfSaleNumber, documentType, outcome }) => [
          pointOfSaleNumber,
          documentType,
          outcome.kind,
        ]),
      ).toEqual([
        [POINT_OF_SALE, "factura_c", "accepted"],
        [8, "factura_c", "accepted"],
      ]);
      expect(
        documentReports.reports.map(({ pointOfSaleNumber, documents: sent }) => [
          pointOfSaleNumber,
          sent.map(({ number }) => number),
        ]),
      ).toEqual([
        [POINT_OF_SALE, [1, 2, 3]],
        [8, [10, 11]],
      ]);
      expect(declarations.declarations).toEqual([]);
    });

    it("reports a presentation whose deadline has passed all the same", async () => {
      const { documentReports, run } = setUp({ now: ON_OCTOBER_20 });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "accepted" });
      expect(documentReports.reports).toHaveLength(1);
    });

    it("blocks the fortnight and sends nothing without proof that the register's stream reaches past the close", async () => {
      const { streams, reports, documentReports, run } = setUp();
      streams.installations.set(REGISTER_ID, [reachingInstallation({ latestOccurredAt: null })]);

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "blocked" });
      expect(reports.changes.map(({ change }) => change.state)).toEqual(["blocked"]);
      expect(documentReports.lastReportedCalls).toEqual([]);
      expect(documentReports.reports).toEqual([]);
    });
  });

  describe("the batch size", () => {
    it("is asked of the tax authority before every batch and followed", async () => {
      const { documentReports, run } = setUp({ numbers: [1, 2, 3, 4, 5] });
      documentReports.limit = 2;

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "accepted" });
      expect(documentReports.batchLimitCalls).toEqual([TOKEN, TOKEN, TOKEN]);
      expect(reportedNumbers(documentReports.reports)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it("is whatever the tax authority answers, never a number of its own", async () => {
      const { documentReports, run } = setUp({ numbers: [1, 2, 3, 4, 5] });
      documentReports.limit = 1;

      await run();

      expect(reportedNumbers(documentReports.reports)).toEqual([[1], [2], [3], [4], [5]]);
    });

    it("asks again what the tax authority holds before every batch", async () => {
      const { operations, documentReports, run } = setUp({ numbers: [1, 2, 3, 4] });
      documentReports.limit = 2;

      await run();

      expect(
        operations.filter(
          (operation) =>
            operation.startsWith("tax authority lastReported") ||
            operation.startsWith("tax authority report"),
        ),
      ).toEqual([
        "tax authority lastReported factura_c",
        "tax authority report factura_c",
        "tax authority lastReported factura_c",
        "tax authority report factura_c",
        "tax authority lastReported factura_c",
      ]);
    });

    it("sends nothing when the tax authority does not say how many fit", async () => {
      const { documentReports, reports, run } = setUp();
      documentReports.batchLimitAnswer = () => ({ kind: "no_answer" });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "lookup_no_answer" });
      expect(documentReports.reports).toEqual([]);
      expect(reports.documentTypeChanges).toEqual([]);
    });

    it("sends nothing when the tax authority refuses to say how many fit", async () => {
      const { documentReports, run } = setUp();
      const rejections = [{ code: 600, message: "Token invalid" }];
      documentReports.batchLimitAnswer = () => ({ kind: "refused", rejections });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({
        kind: "lookup_refused",
        rejections,
      });
      expect(documentReports.reports).toEqual([]);
    });
  });

  describe("documents the tax authority already holds", () => {
    it("are never sent again", async () => {
      const { documentReports, run } = setUp({ numbers: [1, 2, 3, 4, 5] });
      documentReports.hold(POINT_OF_SALE, "factura_c", 3);

      await run();

      expect(reportedNumbers(documentReports.reports)).toEqual([[4, 5]]);
    });

    it("leave nothing to send once it holds them all, and the presentation is accepted", async () => {
      const { documentReports, reports, run } = setUp();
      documentReports.hold(POINT_OF_SALE, "factura_c", 3);

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "accepted" });
      expect(documentReports.reports).toEqual([]);
      expect(documentReports.batchLimitCalls).toEqual([]);
      expect(reports.documentTypeChanges.map(({ change }) => change)).toEqual([
        { documentType: "factura_c", state: "accepted", at: ON_OCTOBER_3, reportedThrough: 3 },
      ]);
    });

    it("are not sent again when the tax authority's count lags behind a batch it just accepted", async () => {
      const { documentReports, run } = setUp({ numbers: [1, 2, 3, 4] });
      documentReports.limit = 2;
      documentReports.lastReportedAnswer = () => ({ kind: "read", number: 0 });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "unclear" });
      expect(reportedNumbers(documentReports.reports)).toEqual([[1, 2]]);
    });

    it("are not sent again when the tax authority's count reaches only partway into a batch it just accepted", async () => {
      const { documentReports, run } = setUp({ numbers: [1, 2, 3, 4] });
      documentReports.limit = 3;
      const counts = [0, 2];
      documentReports.lastReportedAnswer = () => ({ kind: "read", number: counts.shift() ?? 2 });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "unclear" });
      expect(reportedNumbers(documentReports.reports)).toEqual([[1, 2, 3]]);
    });

    it("are not assumed when the tax authority does not say what it holds", async () => {
      const { documentReports, reports, run } = setUp();
      documentReports.lastReportedAnswer = () => ({ kind: "no_answer" });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "lookup_no_answer" });
      expect(documentReports.reports).toEqual([]);
      expect(reports.documentTypeChanges).toEqual([]);
      expect(reports.changes).toEqual([]);
    });

    it("are not assumed when the tax authority refuses to say what it holds", async () => {
      const { documentReports, run } = setUp();
      const rejections = [{ code: 600, message: "Token invalid" }];
      documentReports.lastReportedAnswer = () => ({ kind: "refused", rejections });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({
        kind: "lookup_refused",
        rejections,
      });
      expect(documentReports.reports).toEqual([]);
    });
  });

  describe("when the tax authority's answer to a batch does not arrive", () => {
    it("leaves the presentation submitting and reports it unclear", async () => {
      const { documentReports, reports, run } = setUp();
      documentReports.reportAnswer = () => ({ kind: "no_answer" });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "unclear" });
      expect(reports.documentTypeChanges.map(({ change }) => change.state)).toEqual(["submitting"]);
      expect(reports.changes.map(({ change }) => change.state)).toEqual(["submitting"]);
    });

    it("is settled on the next run by asking what the tax authority holds, never by sending blindly", async () => {
      const { documentReports, run } = setUp();
      documentReports.reportAnswer = () => ({ kind: "no_answer" });
      await run();
      documentReports.hold(POINT_OF_SALE, "factura_c", 3);
      documentReports.reportAnswer = () => ({ kind: "accepted" });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "accepted" });
      expect(documentReports.reports).toHaveLength(1);
    });

    it("sends again on the next run only what the tax authority says it does not hold", async () => {
      const { documentReports, run } = setUp();
      documentReports.reportAnswer = () => ({ kind: "no_answer" });
      await run();
      documentReports.hold(POINT_OF_SALE, "factura_c", 1);
      documentReports.reportAnswer = () => ({ kind: "accepted" });

      await run();

      expect(reportedNumbers(documentReports.reports)).toEqual([
        [1, 2, 3],
        [2, 3],
      ]);
    });
  });

  describe("when the tax authority rejects a document of the batch", () => {
    it("records the presentation refused with the rejected document, keeping what it accepted before it", async () => {
      const { documentReports, reports, run } = setUp({ numbers: [1, 2, 3, 4, 5] });
      documentReports.reportAnswer = () => ({
        kind: "rejected",
        number: 3,
        rejections: REJECTIONS,
      });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({
        kind: "rejected",
        number: 3,
        rejections: REJECTIONS,
      });
      expect(reports.documentTypeChanges.map(({ change }) => change).at(-1)).toEqual({
        documentType: "factura_c",
        state: "refused",
        at: ON_OCTOBER_3,
        reportedThrough: 2,
        rejectedNumber: 3,
        rejections: REJECTIONS,
      });
      expect(reports.changes.map(({ change }) => change)).toEqual([
        { state: "refused", at: ON_OCTOBER_3, rejections: REJECTIONS },
      ]);
    });

    it("sends nothing more in that run", async () => {
      const { documentReports, run } = setUp({ numbers: [1, 2, 3, 4, 5] });
      documentReports.limit = 2;
      documentReports.reportAnswer = () => ({
        kind: "rejected",
        number: 2,
        rejections: REJECTIONS,
      });

      await run();

      expect(reportedNumbers(documentReports.reports)).toEqual([[1, 2]]);
    });

    it("is not tried again before the retry interval has passed", async () => {
      const { documentReports, run, clock } = setUp();
      documentReports.reportAnswer = () => ({
        kind: "rejected",
        number: 1,
        rejections: REJECTIONS,
      });
      await run();
      clock.advanceBy(30 * 60 * 1000);

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "retry_not_due" });
      expect(documentReports.reports).toHaveLength(1);
    });
  });

  describe("when the tax authority refuses the whole batch", () => {
    it("records the presentation refused with its rejections", async () => {
      const { documentReports, reports, run } = setUp();
      const rejections = [{ code: 703, message: "El numero de comprobante informado debe ser" }];
      documentReports.reportAnswer = () => ({ kind: "refused", rejections });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "refused", rejections });
      expect(reports.documentTypeChanges.map(({ change }) => change).at(-1)).toEqual({
        documentType: "factura_c",
        state: "refused",
        at: ON_OCTOBER_3,
        reportedThrough: 0,
        rejections,
      });
      expect(reports.changes.map(({ change }) => change.state)).toEqual(["refused"]);
    });
  });

  describe("a document missing from the series", () => {
    it("blocks the presentation and sends nothing when the next number the tax authority expects is missing", async () => {
      const { documentReports, reports, run } = setUp({ numbers: [3, 4] });
      documentReports.hold(POINT_OF_SALE, "factura_c", 1);

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({
        kind: "gap",
        expectedNumber: 2,
      });
      expect(documentReports.reports).toEqual([]);
      expect(reports.documentTypeChanges.map(({ change }) => change)).toEqual([
        { documentType: "factura_c", state: "blocked", at: ON_OCTOBER_3, reportedThrough: 1 },
      ]);
      expect(reports.changes.map(({ change }) => change)).toStrictEqual([
        { state: "blocked", at: ON_OCTOBER_3 },
      ]);
    });

    it("sends what comes before the missing number and stops there", async () => {
      const { documentReports, run } = setUp({ numbers: [1, 2, 4, 5] });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({
        kind: "gap",
        expectedNumber: 3,
      });
      expect(reportedNumbers(documentReports.reports)).toEqual([[1, 2]]);
    });
  });

  describe("documents that sync in after the fortnight was accepted with documents", () => {
    it("are reported, sending only what the tax authority does not hold yet", async () => {
      const { reports, documents, documentReports, run } = setUp();
      reports.seed(PRESENTATION, {
        state: "accepted",
        movement: "documents",
        lastAttemptAt: new Date("2026-10-02T12:00:00.000Z"),
      });
      reports.seedReportedThrough(PRESENTATION, "factura_c", 3);
      documentReports.hold(POINT_OF_SALE, "factura_c", 3);
      documents.add(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, ...documentsNumbered(4, 5));

      const result = await run();

      expect(presentationOutcomes(result)).toEqual([
        {
          pointOfSaleNumber: POINT_OF_SALE,
          fortnight: SEPTEMBER_SECOND_HALF,
          documentType: "factura_c",
          outcome: { kind: "accepted" },
        },
      ]);
      expect(reportedNumbers(documentReports.reports)).toEqual([[4, 5]]);
    });

    it("block the fortnight and are not sent without proof that the register's stream reaches past the close", async () => {
      const { reports, documents, documentReports, streams, run } = setUp();
      reports.seed(PRESENTATION, {
        state: "accepted",
        movement: "documents",
        lastAttemptAt: new Date("2026-10-02T12:00:00.000Z"),
      });
      reports.seedReportedThrough(PRESENTATION, "factura_c", 3);
      documents.add(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, ...documentsNumbered(4));
      streams.installations.set(REGISTER_ID, [reachingInstallation({ latestOccurredAt: null })]);

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "blocked" });
      expect(reports.changes.map(({ change }) => change.state)).toEqual(["blocked"]);
      expect(documentReports.lastReportedCalls).toEqual([]);
      expect(documentReports.reports).toEqual([]);
    });

    it("leave nothing to do while every document is already reported", async () => {
      const { reports, documentReports, operations, run } = setUp();
      reports.seed(PRESENTATION, {
        state: "accepted",
        movement: "documents",
        lastAttemptAt: new Date("2026-10-02T12:00:00.000Z"),
      });
      reports.seedReportedThrough(PRESENTATION, "factura_c", 3);

      const result = await run();

      expect(presentationOutcomes(result)).toEqual([]);
      expect(documentReports.lastReportedCalls).toEqual([]);
      expect(operations).toEqual(["owedReports", "acceptedWithUnreportedDocuments"]);
    });
  });

  describe("documents that sync in after the fortnight was accepted as having no movement", () => {
    function acceptedWithoutMovement() {
      const setup = setUp();
      setup.reports.seed(PRESENTATION, {
        state: "accepted",
        movement: "none",
        lastAttemptAt: new Date("2026-10-02T12:00:00.000Z"),
      });
      return setup;
    }

    it("mark the presentation for manual regularization and send nothing", async () => {
      const { reports, documentReports, declarations, operations, run } = acceptedWithoutMovement();

      const result = await run();

      expect(presentationOutcomes(result)).toEqual([
        {
          pointOfSaleNumber: POINT_OF_SALE,
          fortnight: SEPTEMBER_SECOND_HALF,
          documentType: null,
          outcome: { kind: "needs_regularization" },
        },
      ]);
      expect(operations).toEqual([
        "owedReports",
        "acceptedWithUnreportedDocuments",
        `hold ${KEY}`,
        "documentsOn",
        "record needs_regularization",
        `release ${KEY}`,
      ]);
      expect(reports.changes.map(({ change }) => change)).toEqual([
        { state: "needs_regularization", at: ON_OCTOBER_3 },
      ]);
      expect(documentReports.lastReportedCalls).toEqual([]);
      expect(documentReports.reports).toEqual([]);
      expect(declarations.declarations).toEqual([]);
    });

    it("leave the presentation alone when its documents are no longer there under the lock", async () => {
      const { reports, documents, run } = setUpReportFortnights();
      reports.seed(PRESENTATION, {
        state: "accepted",
        movement: "none",
        lastAttemptAt: new Date("2026-10-02T12:00:00.000Z"),
      });
      const listed = {
        pointOfSaleNumber: POINT_OF_SALE,
        registerId: REGISTER_ID,
        code: codeFor(SEPTEMBER_SECOND_HALF),
      };
      reports.acceptedWithUnreportedDocuments = async () => [listed];

      const result = await run();

      expect(documents.of(POINT_OF_SALE, SEPTEMBER_SECOND_HALF)).toEqual([]);
      expect(presentationOutcomes(result)).toEqual([]);
      expect(reports.changes).toEqual([]);
    });

    it("are left alone once the presentation is marked for manual regularization", async () => {
      const { reports, documentReports, run } = acceptedWithoutMovement();
      await run();

      const result = await run();

      expect(presentationOutcomes(result)).toEqual([]);
      expect(reports.changes).toHaveLength(1);
      expect(documentReports.reports).toEqual([]);
    });

    it("are marked for manual regularization however late it is", async () => {
      const { reports, run } = setUp({ now: ON_OCTOBER_20 });
      reports.seed(PRESENTATION, {
        state: "accepted",
        movement: "none",
        lastAttemptAt: new Date("2026-10-02T12:00:00.000Z"),
      });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "needs_regularization" });
    });

    it("are marked for manual regularization in the same run that finds the tax authority already holds a declaration of no movement", async () => {
      const { declarations, documentReports, run } = setUp();
      declarations.lookUpAnswer = () => ({ kind: "held" });

      const result = await run();

      expect(presentationOutcomes(result).map(({ outcome }) => outcome.kind)).toEqual([
        "already_declared",
        "needs_regularization",
      ]);
      expect(documentReports.reports).toEqual([]);
    });
  });
});
