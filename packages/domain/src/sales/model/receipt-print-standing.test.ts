import { describe, expect, it } from "vitest";
import {
  mayStartReceiptPrint,
  observePrinterNotConfigured,
  observePrinterStatus,
  observePrintFailed,
  observePrintSent,
  receiptPrintStanding,
  startedReceiptPrint,
} from "./receipt-print-standing.js";

describe("receiptPrintStanding", () => {
  it("is printing while no status has been seen", () => {
    expect(receiptPrintStanding(startedReceiptPrint())).toBe("printing");
  });

  it.each(["ready", "cover_open", "paper_out", "not_responding"] as const)(
    "stands as the last status the printer reported, %s",
    (status) => {
      const observed = observePrinterStatus(startedReceiptPrint(), status);

      expect(receiptPrintStanding(observed)).toBe(status === "ready" ? "printing" : status);
    },
  );

  it("follows the printer from one status to the next", () => {
    let observed = observePrinterStatus(startedReceiptPrint(), "paper_out");
    observed = observePrinterStatus(observed, "cover_open");

    expect(receiptPrintStanding(observed)).toBe("cover_open");

    observed = observePrinterStatus(observed, "ready");

    expect(receiptPrintStanding(observed)).toBe("printing");
  });

  it("is printed once the receipt was sent, whatever the printer reported before", () => {
    let observed = observePrinterStatus(startedReceiptPrint(), "paper_out");
    observed = observePrintSent(observed);

    expect(receiptPrintStanding(observed)).toBe("printed");
  });

  it("stays printed when a status arrives after the receipt was sent", () => {
    const sent = observePrintSent(startedReceiptPrint());

    expect(receiptPrintStanding(observePrinterStatus(sent, "paper_out"))).toBe("printed");
  });

  it.each([
    ["no status was seen", startedReceiptPrint()],
    ["the printer reported paper out", observePrinterStatus(startedReceiptPrint(), "paper_out")],
    ["the printer was ready", observePrinterStatus(startedReceiptPrint(), "ready")],
  ])("is failed once the print failed, after %s", (_case, observed) => {
    expect(receiptPrintStanding(observePrintFailed(observed))).toBe("failed");
  });

  it("stays printed when a failure is observed after the receipt was sent", () => {
    const sent = observePrintSent(startedReceiptPrint());

    expect(receiptPrintStanding(observePrintFailed(sent))).toBe("printed");
  });

  it("stays failed when a status arrives after the failure", () => {
    const failed = observePrintFailed(startedReceiptPrint());

    expect(receiptPrintStanding(observePrinterStatus(failed, "ready"))).toBe("failed");
  });

  it("is printer_not_configured once the print found no configured printer", () => {
    expect(receiptPrintStanding(observePrinterNotConfigured(startedReceiptPrint()))).toBe(
      "printer_not_configured",
    );
  });

  it("stays printed when the missing printer is observed after the receipt was sent", () => {
    const sent = observePrintSent(startedReceiptPrint());

    expect(receiptPrintStanding(observePrinterNotConfigured(sent))).toBe("printed");
  });

  it("is printer_not_configured rather than failed or a printer status", () => {
    let observed = observePrinterStatus(startedReceiptPrint(), "paper_out");
    observed = observePrintFailed(observed);

    expect(receiptPrintStanding(observePrinterNotConfigured(observed))).toBe(
      "printer_not_configured",
    );
  });

  it("does not change the observation it folds into", () => {
    const started = startedReceiptPrint();
    observePrinterNotConfigured(started);
    observePrinterStatus(started, "ready");
    observePrintSent(started);
    observePrintFailed(started);

    expect(started).toEqual({
      sent: false,
      failed: false,
      printerNotConfigured: false,
      status: null,
    });
  });
});

describe("mayStartReceiptPrint", () => {
  it("allows a print when none is in progress for the sale", () => {
    expect(mayStartReceiptPrint(undefined)).toBe(true);
  });

  it("refuses a print while the previous one is printing", () => {
    expect(mayStartReceiptPrint(startedReceiptPrint())).toBe(false);
    expect(mayStartReceiptPrint(observePrinterStatus(startedReceiptPrint(), "ready"))).toBe(false);
  });

  it.each(["cover_open", "paper_out", "not_responding"] as const)(
    "refuses a print while the printer reports %s",
    (status) => {
      expect(mayStartReceiptPrint(observePrinterStatus(startedReceiptPrint(), status))).toBe(false);
    },
  );

  it("allows a print once the previous one found no configured printer", () => {
    expect(mayStartReceiptPrint(observePrinterNotConfigured(startedReceiptPrint()))).toBe(true);
  });

  it("allows a print after the previous one failed", () => {
    expect(mayStartReceiptPrint(observePrintFailed(startedReceiptPrint()))).toBe(true);
  });

  it("allows a print after the previous one was sent", () => {
    expect(mayStartReceiptPrint(observePrintSent(startedReceiptPrint()))).toBe(true);
  });
});
