import { describe, expect, it } from "vitest";
import { offlineDocument } from "./test-support/fake-fortnight-reports.js";
import {
  POINT_OF_SALE,
  presentationOutcomes,
  REAL_TIME_POINT_OF_SALE,
  REGISTER_ID,
  SEPTEMBER_SECOND_HALF,
  setUpReportFortnights,
} from "./test-support/report-fortnights.js";

const KEY = { pointOfSaleNumber: POINT_OF_SALE, fortnight: SEPTEMBER_SECOND_HALF };
const REJECTIONS = [{ code: 1439, message: "El campo 'Importe Total' ImpTotal, debe ser igual" }];
const HOUR_MS = 60 * 60 * 1000;

function reportedNumbers(reports: { documents: { number: number }[] }[]) {
  return reports.map(({ documents }) => documents.map(({ number }) => number));
}

async function setUpRejectedAt(rejectedNumber: number, numbers = [1, 2, 3, 4, 5]) {
  const setup = setUpReportFortnights();
  setup.documents.add(
    POINT_OF_SALE,
    SEPTEMBER_SECOND_HALF,
    ...numbers.map((number) => offlineDocument(number)),
  );
  setup.documentReports.reportAnswer = () => ({
    kind: "rejected",
    number: rejectedNumber,
    rejections: REJECTIONS,
  });
  await setup.run();
  setup.documentReports.reportAnswer = () => ({ kind: "accepted" });
  return setup;
}

function remedyRecordedAfterRejection(
  { reports, clock }: Awaited<ReturnType<typeof setUpRejectedAt>>,
  number: number,
) {
  clock.advanceBy(1000);
  reports.recordRemedy(KEY, "factura_c", { number, recordedAt: clock.now() });
}

describe("reportFortnights, for a document the tax authority rejected", () => {
  describe("while its remedy is not recorded", () => {
    it("asks the tax authority nothing and reports the presentation as awaiting the remedy of the rejected number", async () => {
      const setup = await setUpRejectedAt(3);
      const callsBefore = setup.operations.length;
      setup.clock.advanceBy(5 * HOUR_MS);

      const result = await setup.run();

      expect(presentationOutcomes(result)).toEqual([
        {
          pointOfSaleNumber: POINT_OF_SALE,
          fortnight: SEPTEMBER_SECOND_HALF,
          documentType: "factura_c",
          outcome: { kind: "awaiting_remedy", number: 3 },
        },
      ]);
      expect(
        setup.operations.slice(callsBefore).filter((op) => op.startsWith("tax authority")),
      ).toEqual([]);
      expect(setup.documentReports.reports).toHaveLength(1);
    });

    it("awaits the remedy right away, without the hourly wait of a retry", async () => {
      const setup = await setUpRejectedAt(3);

      const result = await setup.run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({
        kind: "awaiting_remedy",
        number: 3,
      });
    });

    it("records nothing", async () => {
      const setup = await setUpRejectedAt(3);
      const changes = setup.reports.changes.length;
      const typeChanges = setup.reports.documentTypeChanges.length;
      setup.clock.advanceBy(5 * HOUR_MS);

      await setup.run();

      expect(setup.reports.changes).toHaveLength(changes);
      expect(setup.reports.documentTypeChanges).toHaveLength(typeChanges);
    });

    it("keeps awaiting when the only remedy recorded is older than the rejection", async () => {
      const setup = await setUpRejectedAt(3);
      setup.reports.recordRemedy(KEY, "factura_c", {
        number: 3,
        recordedAt: new Date(setup.clock.now().getTime() - 1000),
      });
      setup.clock.advanceBy(5 * HOUR_MS);

      const result = await setup.run();

      expect(presentationOutcomes(result)[0]?.outcome.kind).toBe("awaiting_remedy");
    });

    it("keeps awaiting when the remedy recorded is for another number", async () => {
      const setup = await setUpRejectedAt(3);
      setup.clock.advanceBy(1000);
      setup.reports.recordRemedy(KEY, "factura_c", { number: 2, recordedAt: setup.clock.now() });

      const result = await setup.run();

      expect(presentationOutcomes(result)[0]?.outcome.kind).toBe("awaiting_remedy");
    });

    it("still tries a presentation the tax authority refused whole once the retry interval has passed", async () => {
      const setup = setUpReportFortnights();
      setup.documents.add(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, offlineDocument(1));
      setup.documentReports.reportAnswer = () => ({ kind: "refused", rejections: REJECTIONS });
      await setup.run();
      setup.clock.advanceBy(HOUR_MS);

      const result = await setup.run();

      expect(presentationOutcomes(result)[0]?.outcome.kind).toBe("refused");
      expect(setup.documentReports.reports).toHaveLength(2);
    });

    it("does not retry a presentation refused whole before the retry interval passes, whatever remedy is recorded", async () => {
      const setup = setUpReportFortnights();
      setup.documents.add(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, offlineDocument(1));
      setup.documentReports.reportAnswer = () => ({ kind: "refused", rejections: REJECTIONS });
      await setup.run();
      setup.clock.advanceBy(1000);
      setup.reports.recordRemedy(KEY, "factura_c", { number: 1, recordedAt: setup.clock.now() });

      const result = await setup.run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "retry_not_due" });
      expect(setup.documentReports.reports).toHaveLength(1);
    });

    it("presents the fortnights without a rejected document as usual", async () => {
      const setup = await setUpRejectedAt(3);
      setup.reports.pointsOfSale = [
        ...setup.reports.pointsOfSale,
        {
          pointOfSaleNumber: 8,
          registerId: "register-2",
          claimedAt: new Date("2026-09-01T12:00:00.000Z"),
        },
      ];
      setup.streams.installations.set(
        "register-2",
        setup.streams.installations.get(REGISTER_ID) ?? [],
      );
      setup.documents.add(8, SEPTEMBER_SECOND_HALF, offlineDocument(10));
      setup.documentReports.hold(8, "factura_c", 9);

      const result = await setup.run();

      expect(
        presentationOutcomes(result).map(({ pointOfSaleNumber, outcome }) => [
          pointOfSaleNumber,
          outcome.kind,
        ]),
      ).toEqual([
        [POINT_OF_SALE, "awaiting_remedy"],
        [8, "accepted"],
      ]);
    });
  });

  describe("once its remedy is recorded", () => {
    it("sends the rejected document and every one left unprocessed behind it, right away, in a new presentation", async () => {
      const setup = await setUpRejectedAt(3);
      remedyRecordedAfterRejection(setup, 3);

      const result = await setup.run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "accepted" });
      expect(reportedNumbers(setup.documentReports.reports)).toEqual([
        [1, 2, 3, 4, 5],
        [3, 4, 5],
      ]);
    });

    it("records the fortnight as accepted with its documents", async () => {
      const setup = await setUpRejectedAt(3);
      remedyRecordedAfterRejection(setup, 3);

      await setup.run();

      expect(setup.reports.changes.at(-1)?.change.state).toBe("accepted");
      expect(setup.reports.documentTypeChanges.at(-1)?.change).toMatchObject({
        state: "accepted",
        reportedThrough: 5,
      });
    });

    it("awaits a remedy again when the tax authority rejects the same number once more", async () => {
      const setup = await setUpRejectedAt(3);
      remedyRecordedAfterRejection(setup, 3);
      setup.clock.advanceBy(1000);
      setup.documentReports.reportAnswer = () => ({
        kind: "rejected",
        number: 3,
        rejections: REJECTIONS,
      });
      await setup.run();
      setup.clock.advanceBy(HOUR_MS);

      const result = await setup.run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({
        kind: "awaiting_remedy",
        number: 3,
      });
    });

    it("sends the documents as presented, with the correction a person entered", async () => {
      const setup = await setUpRejectedAt(3);
      setup.documents.replace(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, [
        offlineDocument(1),
        offlineDocument(2),
        offlineDocument(3, { correction: { issuedOn: "2026-09-21", total: 9_900 } }),
        offlineDocument(4),
        offlineDocument(5),
      ]);
      remedyRecordedAfterRejection(setup, 3);

      await setup.run();

      expect(setup.documentReports.reports.at(-1)?.documents).toEqual([
        offlineDocument(3, {
          issuedOn: "2026-09-21",
          total: 9_900,
          netAmount: 9_900,
          correction: { issuedOn: "2026-09-21", total: 9_900 },
        }),
        offlineDocument(4),
        offlineDocument(5),
      ]);
    });
  });

  describe("the credit note of a document printed wrong", () => {
    const corrected = { correction: { issuedOn: "2026-09-21", total: 9_900 } };

    async function setUpCorrected() {
      const setup = await setUpRejectedAt(3);
      setup.documents.replace(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, [
        offlineDocument(1),
        offlineDocument(2),
        offlineDocument(3, corrected),
        offlineDocument(4),
        offlineDocument(5),
      ]);
      remedyRecordedAfterRejection(setup, 3);
      return setup;
    }

    it("is recorded in the run that finds the corrected number accepted, for the whole corrected total, on the register's real-time point of sale", async () => {
      const setup = await setUpCorrected();

      await setup.run();

      expect([...setup.reports.creditNotes.values()]).toEqual([
        {
          saleId: "sale-3",
          reason: "rejected_document",
          pointOfSale: REAL_TIME_POINT_OF_SALE,
          associatedVoucher: { voucherType: 11, pointOfSale: POINT_OF_SALE, number: 3 },
          total: 9_900,
          receiverTaxStatusCode: 5,
        },
      ]);
    });

    it("is recorded after the tax authority is asked again what it holds, and before the presentation is recorded as accepted", async () => {
      const setup = await setUpCorrected();
      const before = setup.operations.length;

      await setup.run();

      const run = setup.operations.slice(before);
      const report = run.indexOf("tax authority report factura_c");
      const credit = run.indexOf("credit corrected document 3");
      expect(run.slice(report, credit)).toContain("tax authority lastReported factura_c");
      expect(credit).toBeLessThan(run.indexOf("record factura_c accepted"));
    });

    it("is not recorded while the tax authority still rejects the corrected number", async () => {
      const setup = await setUpCorrected();
      setup.documentReports.reportAnswer = () => ({
        kind: "rejected",
        number: 3,
        rejections: REJECTIONS,
      });

      await setup.run();

      expect(setup.reports.creditNotes.size).toBe(0);
    });

    it("is not recorded while the tax authority gives no answer about the corrected number", async () => {
      const setup = await setUpCorrected();
      setup.documentReports.reportAnswer = () => ({ kind: "no_answer" });

      await setup.run();

      expect(setup.reports.creditNotes.size).toBe(0);
    });

    it("is recorded by a later run when the tax authority already holds the corrected number, as after a crash before the record", async () => {
      const setup = await setUpCorrected();
      setup.documentReports.hold(POINT_OF_SALE, "factura_c", 5);

      await setup.run();

      expect(setup.documentReports.reports).toHaveLength(1);
      expect([...setup.reports.creditNotes.keys()]).toEqual([`${POINT_OF_SALE}:3`]);
    });

    it("is not recorded for a document that was never corrected, nor for a remedy that only reported it again", async () => {
      const setup = await setUpRejectedAt(3);
      remedyRecordedAfterRejection(setup, 3);

      await setup.run();

      expect(setup.reports.creditNotes.size).toBe(0);
      expect(setup.operations.some((op) => op.startsWith("credit corrected"))).toBe(false);
    });

    it("is recorded for each corrected document the tax authority holds, and only for them", async () => {
      const setup = await setUpRejectedAt(3);
      setup.documents.replace(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, [
        offlineDocument(1, { correction: { total: 100 } }),
        offlineDocument(2),
        offlineDocument(3, corrected),
        offlineDocument(4),
        offlineDocument(5, { correction: { total: 500 } }),
      ]);
      remedyRecordedAfterRejection(setup, 3);

      await setup.run();

      expect(
        [...setup.reports.creditNotes.values()].map(
          ({ associatedVoucher }) => associatedVoucher.number,
        ),
      ).toEqual([1, 3, 5]);
    });

    it("waits for the register to have a real-time point of sale", async () => {
      const setup = await setUpCorrected();
      setup.reports.realTimePointsOfSale.clear();

      await setup.run();

      expect(setup.reports.creditNotes.size).toBe(0);
      expect(setup.reports.changes.at(-1)?.change.state).toBe("accepted");
    });
  });
});
