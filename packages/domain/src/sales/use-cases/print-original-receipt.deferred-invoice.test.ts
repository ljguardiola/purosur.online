import { describe, expect, it } from "vitest";
import { printOriginalReceipt } from "./print-original-receipt.js";
import {
  completedSale,
  FIRST_PRINT_AT,
  receiptRig,
  SENT_AT,
  voidedSale,
} from "./test-support/receipt-rig.js";

const KEY = { document: "deferred_invoice", saleId: "sale-1" } as const;

describe("printOriginalReceipt of a deferred invoice", () => {
  it("records its print state apart from the sale receipt's", async () => {
    const rig = receiptRig([completedSale({ printedAt: new Date("2026-10-07T15:00:30.000Z") })]);

    const printing = printOriginalReceipt(rig.ports, KEY, rig.watch);
    await rig.printer.whenWaiting();
    rig.printer.becomeReady();
    rig.clock.set(SENT_AT);

    expect(await printing).toEqual({ kind: "printed", copy: { kind: "original" } });
    expect(rig.ledger.state.sales[0]?.deferredInvoice).toMatchObject({
      printAttemptedAt: FIRST_PRINT_AT,
      printedAt: SENT_AT,
    });
    expect(rig.ledger.state.sales[0]).toMatchObject({
      printAttemptedAt: null,
      printedAt: new Date("2026-10-07T15:00:30.000Z"),
    });
  });

  it("emits a print-state event naming the deferred invoice", async () => {
    const rig = receiptRig();

    const printing = printOriginalReceipt(rig.ports, KEY, rig.watch);
    await rig.printer.whenWaiting();
    rig.printer.becomeReady();
    await printing;

    expect(rig.ledger.state.outbox.map(({ payload }) => payload)).toEqual([
      expect.objectContaining({ sale_id: "sale-1", document: "deferred_invoice" }),
    ]);
  });

  it("refuses a second original once the first was attempted", async () => {
    const rig = receiptRig([
      completedSale({
        deferredInvoice: {
          printAttemptedAt: FIRST_PRINT_AT,
          printedAt: null,
          stored: undefined,
          reprints: [],
        },
      }),
    ]);

    expect(await printOriginalReceipt(rig.ports, KEY, rig.watch)).toEqual({
      kind: "already_attempted",
    });
  });

  it("is not available for a voided sale", async () => {
    const rig = receiptRig([voidedSale()]);

    expect(await printOriginalReceipt(rig.ports, KEY, rig.watch)).toEqual({ kind: "sale_voided" });
  });
});
