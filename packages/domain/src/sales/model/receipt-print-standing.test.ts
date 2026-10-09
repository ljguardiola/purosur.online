import { describe, expect, it } from "vitest";
import {
  mayStartReceiptPrint,
  observePrintAcknowledged,
  observePrinterStatus,
  RECEIPT_RETRY_DELAY_MS,
  type ReceiptPrintObservation,
  receiptPrintStanding,
  startedReceiptPrint,
} from "./receipt-print-standing.js";

const T0 = new Date("2026-10-07T15:00:00.000Z");

function after(ms: number): Date {
  return new Date(T0.getTime() + ms);
}

describe("receiptPrintStanding", () => {
  it("waits a full ten seconds of a ready printer before offering the retry", () => {
    expect(RECEIPT_RETRY_DELAY_MS).toBe(10_000);
  });

  it("is printing while no status has been seen", () => {
    expect(receiptPrintStanding(startedReceiptPrint(), after(60_000))).toBe("printing");
  });

  it("is printing while the printer has been ready for less than the retry delay", () => {
    const observed = observePrinterStatus(startedReceiptPrint(), "ready", T0);

    expect(receiptPrintStanding(observed, after(9_999))).toBe("printing");
  });

  it("offers the retry once the printer has been ready for the retry delay", () => {
    const observed = observePrinterStatus(startedReceiptPrint(), "ready", T0);

    expect(receiptPrintStanding(observed, after(10_000))).toBe("retry_offered");
    expect(receiptPrintStanding(observed, after(25_000))).toBe("retry_offered");
  });

  it.each(["cover_open", "paper_out", "not_responding"] as const)(
    "stands as %s while the printer reports it, however long",
    (status) => {
      const observed = observePrinterStatus(startedReceiptPrint(), status, T0);

      expect(receiptPrintStanding(observed, after(60_000))).toBe(status);
    },
  );

  it.each(["cover_open", "paper_out", "not_responding"] as const)(
    "restarts the ready clock after %s",
    (status) => {
      let observed = observePrinterStatus(startedReceiptPrint(), "ready", T0);
      observed = observePrinterStatus(observed, status, after(8_000));
      observed = observePrinterStatus(observed, "ready", after(9_000));

      expect(receiptPrintStanding(observed, after(18_999))).toBe("printing");
      expect(receiptPrintStanding(observed, after(19_000))).toBe("retry_offered");
    },
  );

  it("keeps counting from the first ready status while the printer stays ready", () => {
    let observed = observePrinterStatus(startedReceiptPrint(), "ready", T0);
    observed = observePrinterStatus(observed, "ready", after(6_000));

    expect(receiptPrintStanding(observed, after(10_000))).toBe("retry_offered");
  });

  it("is printed once acknowledged, whatever the printer reported before", () => {
    let observed = observePrinterStatus(startedReceiptPrint(), "ready", T0);
    observed = observePrintAcknowledged(observed);

    expect(receiptPrintStanding(observed, after(60_000))).toBe("printed");
  });

  it("stays printed when a status arrives after the acknowledgment", () => {
    const acknowledged = observePrintAcknowledged(startedReceiptPrint());

    expect(
      receiptPrintStanding(observePrinterStatus(acknowledged, "paper_out", after(1)), after(2)),
    ).toBe("printed");
  });

  it("does not change the observation it folds into", () => {
    const started = startedReceiptPrint();
    observePrinterStatus(started, "ready", T0);
    observePrintAcknowledged(started);

    expect(started).toEqual({ acknowledged: false, status: null, readySince: null });
  });
});

describe("mayStartReceiptPrint", () => {
  const inProgress = (ms: number): [ReceiptPrintObservation, Date] => [
    observePrinterStatus(startedReceiptPrint(), "ready", T0),
    after(ms),
  ];

  it("allows a print when none is in progress for the sale", () => {
    expect(mayStartReceiptPrint(undefined, T0)).toBe(true);
  });

  it("refuses a print while the previous one is printing", () => {
    expect(mayStartReceiptPrint(...inProgress(9_999))).toBe(false);
  });

  it("allows a print once the retry is offered", () => {
    expect(mayStartReceiptPrint(...inProgress(10_000))).toBe(true);
  });

  it.each(["cover_open", "paper_out", "not_responding"] as const)(
    "refuses a print while the printer reports %s",
    (status) => {
      expect(
        mayStartReceiptPrint(
          observePrinterStatus(startedReceiptPrint(), status, T0),
          after(60_000),
        ),
      ).toBe(false);
    },
  );

  it("allows a print after the previous one was acknowledged", () => {
    expect(mayStartReceiptPrint(observePrintAcknowledged(startedReceiptPrint()), T0)).toBe(true);
  });
});
