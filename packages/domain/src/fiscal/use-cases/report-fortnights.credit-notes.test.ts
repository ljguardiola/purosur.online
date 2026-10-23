import { describe, expect, it } from "vitest";
import type { Fortnight } from "../model/offline-authorization-code.js";
import { offlineDocument } from "./test-support/fake-fortnight-reports.js";
import {
  ON_OCTOBER_3,
  POINT_OF_SALE,
  presentationOutcomes,
  SEPTEMBER_SECOND_HALF,
  setUpReportFortnights,
} from "./test-support/report-fortnights.js";

const EARLIER_FORTNIGHT = { start: "2026-09-01", end: "2026-09-15" };

function factura(number: number) {
  return offlineDocument(number);
}

function creditNote(number: number, invoiceNumber = number) {
  return offlineDocument(number, {
    documentType: "credit_note_c",
    corrects: { voucherType: 11, pointOfSale: POINT_OF_SALE, number: invoiceNumber },
  });
}

function setUp(documents: ReturnType<typeof offlineDocument>[]) {
  const setup = setUpReportFortnights({ now: ON_OCTOBER_3 });
  setup.documents.add(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, ...documents);
  return setup;
}

function invoiceOf(
  setup: ReturnType<typeof setUp>,
  number: number,
  report: { fortnight: Fortnight; reportAccepted: boolean },
) {
  setup.reports.contingencyInvoiceReports.set(`11:${POINT_OF_SALE}:${number}`, report);
}

describe("reportFortnights, for a fortnight with offline credit notes", () => {
  it("presents the facturas of the fortnight before its credit notes, as a presentation of each type", async () => {
    const setup = setUp([creditNote(1), creditNote(2), factura(1), factura(2)]);

    const result = await setup.run();

    expect(
      presentationOutcomes(result).map(({ documentType, outcome }) => [documentType, outcome.kind]),
    ).toEqual([
      ["factura_c", "accepted"],
      ["credit_note_c", "accepted"],
    ]);
    expect(setup.documentReports.reports.map(({ documentType }) => documentType)).toEqual([
      "factura_c",
      "credit_note_c",
    ]);
    expect(
      setup.documentReports.lastReportedCalls.map(({ documentType }) => documentType),
    ).toContain("credit_note_c");
  });

  it("sends the credit notes in consecutive numbers, asking what the tax authority holds of that type", async () => {
    const setup = setUp([creditNote(1), creditNote(2)]);
    setup.documentReports.hold(POINT_OF_SALE, "credit_note_c", 0);

    await setup.run();

    expect(setup.documentReports.reports).toMatchObject([
      { documentType: "credit_note_c", documents: [{ number: 1 }, { number: 2 }] },
    ]);
  });

  it("stops at a gap in the credit note numbers and records the type as missing a document", async () => {
    const setup = setUp([creditNote(1), creditNote(3)]);

    const result = await setup.run();

    expect(presentationOutcomes(result)[0]).toMatchObject({
      documentType: "credit_note_c",
      outcome: { kind: "gap", expectedNumber: 2 },
    });
    expect(setup.reports.documentTypeChanges.map(({ change }) => change)).toContainEqual({
      documentType: "credit_note_c",
      state: "missing_document",
      at: ON_OCTOBER_3,
      reportedThrough: 1,
    });
  });

  it("declares no absence of movement for a point of sale that only issued credit notes", async () => {
    const setup = setUp([creditNote(1)]);

    const result = await setup.run();

    expect(setup.declarations.declarations).toEqual([]);
    expect(presentationOutcomes(result)).toMatchObject([
      { documentType: "credit_note_c", outcome: { kind: "accepted" } },
    ]);
    expect(setup.reports.changes.map(({ change }) => change)).toEqual([
      { state: "accepted", at: ON_OCTOBER_3, movement: "documents" },
    ]);
  });

  describe("a credit note whose contingency invoice belongs to an earlier fortnight", () => {
    it("holds the credit notes from the first one whose invoice's report is not accepted, sending the ones before it", async () => {
      const setup = setUp([creditNote(1), creditNote(2), creditNote(3)]);
      invoiceOf(setup, 2, { fortnight: EARLIER_FORTNIGHT, reportAccepted: false });

      const result = await setup.run();

      expect(presentationOutcomes(result)).toMatchObject([
        { documentType: "credit_note_c", outcome: { kind: "awaiting_invoice_report" } },
      ]);
      expect(setup.documentReports.reports).toMatchObject([
        { documentType: "credit_note_c", documents: [{ number: 1 }] },
      ]);
      expect(setup.reports.documentTypeChanges.map(({ change }) => change).at(-1)).toEqual({
        documentType: "credit_note_c",
        state: "awaiting_invoice_report",
        at: ON_OCTOBER_3,
        reportedThrough: 1,
      });
      expect(setup.reports.changes.map(({ change }) => change)).toEqual([
        { state: "awaiting_invoice_report", at: ON_OCTOBER_3 },
      ]);
    });

    it("sends nothing of the credit notes when the first one is held, not even asking what the tax authority holds", async () => {
      const setup = setUp([creditNote(1), creditNote(2)]);
      invoiceOf(setup, 1, { fortnight: EARLIER_FORTNIGHT, reportAccepted: false });

      const result = await setup.run();

      expect(presentationOutcomes(result)).toMatchObject([
        { documentType: "credit_note_c", outcome: { kind: "awaiting_invoice_report" } },
      ]);
      expect(setup.documentReports.reports).toEqual([]);
      expect(setup.documentReports.lastReportedCalls).toEqual([]);
    });

    it("keeps the facturas of the fortnight reported while its credit notes wait", async () => {
      const setup = setUp([factura(1), creditNote(1)]);
      invoiceOf(setup, 1, { fortnight: EARLIER_FORTNIGHT, reportAccepted: false });

      const result = await setup.run();

      expect(
        presentationOutcomes(result).map(({ documentType, outcome }) => [
          documentType,
          outcome.kind,
        ]),
      ).toEqual([
        ["factura_c", "accepted"],
        ["credit_note_c", "awaiting_invoice_report"],
      ]);
    });

    it("sends the held credit notes on a later run, once that report is accepted", async () => {
      const setup = setUp([creditNote(1), creditNote(2), creditNote(3)]);
      invoiceOf(setup, 2, { fortnight: EARLIER_FORTNIGHT, reportAccepted: false });
      await setup.run();
      invoiceOf(setup, 2, { fortnight: EARLIER_FORTNIGHT, reportAccepted: true });

      const result = await setup.run();

      expect(presentationOutcomes(result)).toMatchObject([
        { documentType: "credit_note_c", outcome: { kind: "accepted" } },
      ]);
      expect(
        setup.documentReports.reports.map(({ documents }) => documents.map(({ number }) => number)),
      ).toEqual([[1], [2, 3]]);
      expect(
        setup.reports.recordedReports.get(`${POINT_OF_SALE}:${SEPTEMBER_SECOND_HALF.start}`),
      ).toMatchObject({
        state: "accepted",
      });
    });

    it("does not hold a credit note whose invoice's report is accepted", async () => {
      const setup = setUp([creditNote(1)]);
      invoiceOf(setup, 1, { fortnight: EARLIER_FORTNIGHT, reportAccepted: true });

      await setup.run();

      expect(setup.documentReports.reports).toHaveLength(1);
    });
  });

  it("does not hold a credit note of an invoice authorized in real time", async () => {
    const setup = setUp([creditNote(1)]);

    const result = await setup.run();

    expect(presentationOutcomes(result)).toMatchObject([{ outcome: { kind: "accepted" } }]);
  });

  it("does not hold a credit note of an invoice of its own fortnight, which only follows the order of the types", async () => {
    const setup = setUp([creditNote(1)]);
    invoiceOf(setup, 1, {
      fortnight: SEPTEMBER_SECOND_HALF,
      reportAccepted: false,
    });

    const result = await setup.run();

    expect(presentationOutcomes(result)).toMatchObject([{ outcome: { kind: "accepted" } }]);
  });
});
