import { FICTIONAL_ISSUER } from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { printOriginalReceipt } from "./print-original-receipt.js";
import { textOf } from "./test-support/fake-receipt-template.js";
import {
  completedSale,
  creditedSales,
  FIRST_PRINT_AT,
  receiptRig,
  SENT_AT,
  voidedSale,
} from "./test-support/receipt-rig.js";

const creditedSale = creditedSales(FICTIONAL_ISSUER);

const CREDIT_NOTE = { document: "credit_note", saleId: "sale-1" } as const;

describe("printOriginalReceipt of a credit note", () => {
  describe("the first print", () => {
    it("sends the credit note as the original, recording the attempt on the credit note and no reason", async () => {
      const rig = receiptRig([creditedSale()]);

      const printing = printOriginalReceipt(rig.ports, CREDIT_NOTE, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();

      const atSend = rig.printer.sent[0]?.ledgerStateWhenSent.sales[0];
      expect(atSend?.creditNote).toMatchObject({
        printAttemptedAt: FIRST_PRINT_AT,
        printedAt: null,
        reprints: [],
      });
      expect(atSend?.printAttemptedAt).toBeNull();
      expect(textOf(rig.printer.sent[0]?.bytes ?? new Uint8Array())).toBe(
        "CREDIT NOTE HEAD[v1] total 7500\nCREDIT NOTE BODY 0 lines\n",
      );
      expect(await printing).toEqual({ kind: "printed", copy: { kind: "original" } });
    });

    it("renders the credit note once and stores what it rendered with the credit note", async () => {
      const rig = receiptRig([creditedSale()]);

      const printing = printOriginalReceipt(rig.ports, CREDIT_NOTE, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();
      await printing;

      expect(rig.template.renders).toEqual([]);
      expect(rig.template.creditNoteRenders).toHaveLength(1);
      expect(rig.ledger.state.sales[0]?.creditNote?.stored).toMatchObject({
        templateVersion: "v1",
      });
      expect(rig.ledger.state.sales[0]?.stored).toBeUndefined();
    });

    it("records its printed state as an event of the credit note once the printer answers", async () => {
      const rig = receiptRig([creditedSale()]);

      const printing = printOriginalReceipt(rig.ports, CREDIT_NOTE, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();
      rig.clock.set(SENT_AT);
      await printing;

      expect(rig.ledger.state.sales[0]?.creditNote).toMatchObject({
        printAttemptedAt: FIRST_PRINT_AT,
        printedAt: SENT_AT,
      });
      expect(rig.ledger.state.sales[0]).toMatchObject({ printAttemptedAt: null, printedAt: null });
      expect(rig.ledger.state.outbox).toEqual([
        {
          event_id: "id-1",
          aggregate_type: "Sale",
          aggregate_id: "sale-1",
          event_type: "sale_print_state_changed",
          schema_version: 2,
          payload: {
            sale_id: "sale-1",
            document: "credit_note",
            print_attempted_at: FIRST_PRINT_AT.toISOString(),
            printed_at: SENT_AT.toISOString(),
          },
          occurred_at: SENT_AT.toISOString(),
          actor_id: "cashier",
        },
      ]);
    });

    it("is not blocked by the sale's own receipt waiting for the tax authority", async () => {
      const sale = creditedSale();
      const rig = receiptRig([
        { ...sale, source: { ...sale.source, fiscal: { kind: "awaiting" } } },
      ]);

      const printing = printOriginalReceipt(rig.ports, CREDIT_NOTE, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();

      expect(await printing).toEqual({ kind: "printed", copy: { kind: "original" } });
    });
  });

  describe("a later print", () => {
    it("is refused as the original: the credit note was already attempted", async () => {
      const rig = receiptRig([creditedSale({ printAttemptedAt: FIRST_PRINT_AT })]);

      expect(await printOriginalReceipt(rig.ports, CREDIT_NOTE, rig.watch)).toEqual({
        kind: "already_attempted",
      });
      expect(rig.printer.waiting).toEqual([]);
      expect(rig.ledger.state.outbox).toEqual([]);
    });
  });

  describe("when it cannot print", () => {
    it.each([
      ["the credit note was rejected", [creditedSale({ authorized: false })]],
      ["the voided sale has no credit note", [voidedSale()]],
      ["the sale stands", [completedSale()]],
      ["the sale does not exist", []],
    ])("answers not_found and records and sends nothing when %s", async (_name, sales) => {
      const rig = receiptRig(sales);

      expect(await printOriginalReceipt(rig.ports, CREDIT_NOTE, rig.watch)).toEqual({
        kind: "not_found",
      });
      expect(rig.printer.sent).toEqual([]);
      expect(rig.ledger.state.outbox).toEqual([]);
    });

    it("answers printer_not_configured and reads nothing when no printer is configured", async () => {
      const rig = receiptRig([creditedSale()]);
      rig.printers.unconfigure();

      expect(await printOriginalReceipt(rig.ports, CREDIT_NOTE, rig.watch)).toEqual({
        kind: "printer_not_configured",
      });
      expect(rig.ledger.transactions).toBe(0);
    });
  });
});
