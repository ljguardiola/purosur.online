import { describe, expect, it } from "vitest";
import { reprintReceipt } from "./reprint-receipt.js";
import { completedSale, FIRST_PRINT_AT, receiptRig } from "./test-support/receipt-rig.js";

const INPUT = {
  document: "deferred_invoice",
  saleId: "sale-1",
  reason: "el cliente la perdió",
} as const;

describe("reprintReceipt of a deferred invoice", () => {
  it("refuses a factura whose original was never printed, printing and recording nothing", async () => {
    const rig = receiptRig();

    expect(await reprintReceipt(rig.ports, INPUT, rig.watch)).toEqual({
      kind: "original_not_printed",
    });
    expect(rig.printer.waiting).toEqual([]);
    expect(rig.printer.sent).toEqual([]);
    expect(rig.ledger.state.sales[0]?.deferredInvoice).toMatchObject({
      printAttemptedAt: null,
      stored: undefined,
      reprints: [],
    });
    expect(rig.ledger.state.outbox).toEqual([]);
  });

  it("reprints a factura whose original was printed as a numbered duplicate", async () => {
    const rig = receiptRig([
      completedSale({
        deferredInvoice: {
          printAttemptedAt: FIRST_PRINT_AT,
          printedAt: FIRST_PRINT_AT,
          stored: undefined,
          reprints: [],
        },
      }),
    ]);

    const printing = reprintReceipt(rig.ports, INPUT, rig.watch);
    await rig.printer.whenWaiting();
    rig.printer.becomeReady();

    expect(await printing).toEqual({
      kind: "printed",
      copy: { kind: "duplicate", orderNumber: 1 },
    });
  });
});
