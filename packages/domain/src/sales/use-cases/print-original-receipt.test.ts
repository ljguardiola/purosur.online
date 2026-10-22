import { describe, expect, it } from "vitest";
import { printOriginalReceipt } from "./print-original-receipt.js";
import type { ReceiptPrintGrant } from "./receipt-printing.js";
import { FakeOperationAuthority } from "./test-support/fake-operation-authority.js";
import { textOf } from "./test-support/fake-receipt-template.js";
import {
  completedSale,
  FIRST_PRINT_AT,
  NOT_PERMITTED,
  receiptRig,
  SENT_AT,
  voidedSale,
} from "./test-support/receipt-rig.js";

describe("printOriginalReceipt", () => {
  describe("a sale that was never printed", () => {
    it("sends the original, recording the attempt as it sends and no reason", async () => {
      const rig = receiptRig();

      const printing = printOriginalReceipt(
        rig.ports,
        { document: "sale_receipt", saleId: "sale-1" },
        rig.watch,
      );
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();

      const atSend = rig.printer.sent[0]?.ledgerStateWhenSent;
      expect(atSend?.sales[0]?.printAttemptedAt).toEqual(FIRST_PRINT_AT);
      expect(atSend?.sales[0]?.printedAt).toBeNull();
      expect(atSend?.sales[0]?.reprints).toEqual([]);
      expect(atSend?.outbox).toEqual([]);
      expect(textOf(rig.printer.sent[0]?.bytes ?? new Uint8Array())).toBe(
        "HEAD[v1] total 6750\nBODY 1 lines\n",
      );
      await printing;
    });

    it("records printed_at and its print-state event once the printer answers it was sent", async () => {
      const rig = receiptRig();

      const printing = printOriginalReceipt(
        rig.ports,
        { document: "sale_receipt", saleId: "sale-1" },
        rig.watch,
      );
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();
      rig.clock.set(SENT_AT);
      const outcome = await printing;

      expect(outcome).toEqual({ kind: "printed", copy: { kind: "original" } });
      expect(rig.ledger.state.sales[0]).toMatchObject({
        printAttemptedAt: FIRST_PRINT_AT,
        printedAt: SENT_AT,
        reprints: [],
      });
      expect(rig.ledger.state.outbox.map(({ event_type }) => event_type)).toEqual([
        "sale_print_state_changed",
      ]);
    });

    it("writes nothing when the print is abandoned before the printer was ready", async () => {
      const rig = receiptRig();

      const printing = printOriginalReceipt(
        rig.ports,
        { document: "sale_receipt", saleId: "sale-1" },
        rig.watch,
      );
      await rig.printer.whenWaiting();
      rig.printer.abandon();

      expect(await printing).toEqual({ kind: "abandoned", copy: { kind: "original" } });
      expect(rig.ledger.state.sales[0]).toMatchObject({
        printAttemptedAt: null,
        stored: undefined,
      });
      expect(rig.ledger.state.outbox).toEqual([]);
    });
  });

  describe("a sale whose next copy is not the original", () => {
    const attempted = completedSale({ printAttemptedAt: FIRST_PRINT_AT });

    it("answers already_attempted before waiting for the printer, recording and sending nothing", async () => {
      const rig = receiptRig([attempted]);

      const outcome = await printOriginalReceipt(
        rig.ports,
        { document: "sale_receipt", saleId: "sale-1" },
        rig.watch,
      );

      expect(outcome).toEqual({ kind: "already_attempted" });
      expect(rig.printer.waiting).toEqual([]);
      expect(rig.printer.sent).toEqual([]);
      expect(rig.ledger.state.sales[0]).toMatchObject({ reprints: [], stored: undefined });
      expect(rig.ledger.state.outbox).toEqual([]);
    });

    it("answers already_attempted, recording and sending nothing, when the sale was attempted while waiting for the printer", async () => {
      const rig = receiptRig();
      const printing = printOriginalReceipt(
        rig.ports,
        { document: "sale_receipt", saleId: "sale-1" },
        rig.watch,
      );
      await rig.printer.whenWaiting();
      const [sale] = rig.ledger.state.sales;
      if (sale !== undefined) {
        sale.printAttemptedAt = FIRST_PRINT_AT;
      }

      rig.printer.becomeReady();

      expect(await printing).toEqual({ kind: "already_attempted" });
      expect(rig.printer.sent).toEqual([]);
      expect(rig.ledger.state.sales[0]).toMatchObject({
        printAttemptedAt: FIRST_PRINT_AT,
        printedAt: null,
        reprints: [],
        stored: undefined,
      });
      expect(rig.ledger.state.outbox).toEqual([]);
    });
  });

  describe("when it cannot print", () => {
    it("returns the authority's refusal before reading any data or sending", async () => {
      const refusing = new FakeOperationAuthority<ReceiptPrintGrant, typeof NOT_PERMITTED>({
        kind: "refused",
        refusal: NOT_PERMITTED,
      });
      const rig = receiptRig([completedSale()], refusing);

      const outcome = await printOriginalReceipt(
        rig.ports,
        { document: "sale_receipt", saleId: "sale-1" },
        rig.watch,
      );

      expect(outcome).toEqual(NOT_PERMITTED);
      expect(rig.ledger.transactions).toBe(0);
      expect(rig.printer.sent).toEqual([]);
    });

    it("answers printer_not_configured and records nothing when no printer is configured", async () => {
      const rig = receiptRig();
      rig.printers.unconfigure();

      const outcome = await printOriginalReceipt(
        rig.ports,
        { document: "sale_receipt", saleId: "sale-1" },
        rig.watch,
      );

      expect(outcome).toEqual({ kind: "printer_not_configured" });
      expect(rig.ledger.state.sales[0]?.printAttemptedAt).toBeNull();
    });

    it.each([
      ["the sale does not exist", []],
      ["the sale is not completed", [completedSale({ completed: false })]],
    ])("answers not_found when %s", async (_name, sales) => {
      const rig = receiptRig(sales);

      expect(
        await printOriginalReceipt(
          rig.ports,
          { document: "sale_receipt", saleId: "sale-1" },
          rig.watch,
        ),
      ).toEqual({
        kind: "not_found",
      });
    });

    it("answers sale_voided and records and sends nothing for a voided sale", async () => {
      const rig = receiptRig([voidedSale()]);

      const outcome = await printOriginalReceipt(
        rig.ports,
        { document: "sale_receipt", saleId: "sale-1" },
        rig.watch,
      );

      expect(outcome).toEqual({ kind: "sale_voided" });
      expect(rig.printer.sent).toEqual([]);
      expect(rig.ledger.state.sales[0]?.printAttemptedAt).toBeNull();
      expect(rig.ledger.state.sales[0]?.stored).toBeUndefined();
      expect(rig.ledger.state.outbox).toEqual([]);
    });

    it("answers unavailable and records nothing when the outbox is not ready", async () => {
      const rig = receiptRig();
      rig.ledger.state.outboxReady = false;

      const outcome = await printOriginalReceipt(
        rig.ports,
        { document: "sale_receipt", saleId: "sale-1" },
        rig.watch,
      );

      expect(outcome).toEqual({ kind: "unavailable" });
      expect(rig.ledger.state.sales[0]?.printAttemptedAt).toBeNull();
    });
  });
});
