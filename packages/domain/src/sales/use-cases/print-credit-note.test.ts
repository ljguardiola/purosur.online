import { describe, expect, it } from "vitest";
import { RECEIPT_REPRINT_REASON_MAX_LENGTH } from "../model/receipt-reprint-reason.js";
import { printOriginalReceipt } from "./print-original-receipt.js";
import type { ReceiptPrintGrant } from "./receipt-printing.js";
import { reprintReceipt } from "./reprint-receipt.js";
import { FakeOperationAuthority } from "./test-support/fake-operation-authority.js";
import { textOf } from "./test-support/fake-receipt-template.js";
import {
  AUTHORIZED_GRANT,
  completedSale,
  creditedSale,
  FIRST_PRINT_AT,
  NOT_PERMITTED,
  receiptRig,
  SENT_AT,
  voidedSale,
} from "./test-support/receipt-rig.js";

const CREDIT_NOTE = { document: "credit_note", saleId: "sale-1" } as const;
const DUPLICATE_INPUT = { ...CREDIT_NOTE, reason: "el cliente la perdió" };

const encoder = new TextEncoder();
const STORED = {
  templateVersion: "v1",
  head: encoder.encode("STORED HEAD\n"),
  body: encoder.encode("STORED BODY\n"),
};

describe("printing a credit note", () => {
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

    it("is also the original when a reprint is asked for a credit note never printed, with no reprint recorded", async () => {
      const rig = receiptRig([creditedSale()]);

      const printing = reprintReceipt(rig.ports, DUPLICATE_INPUT, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();

      expect(await printing).toEqual({ kind: "printed", copy: { kind: "original" } });
      expect(rig.ledger.state.sales[0]?.creditNote?.reprints).toEqual([]);
      expect(rig.ledger.state.outbox.map(({ event_type }) => event_type)).toEqual([
        "sale_print_state_changed",
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
    const attempted = () =>
      creditedSale({ printAttemptedAt: FIRST_PRINT_AT, printedAt: FIRST_PRINT_AT, stored: STORED });

    it("is refused as the original: the credit note was already attempted", async () => {
      const rig = receiptRig([attempted()]);

      expect(await printOriginalReceipt(rig.ports, CREDIT_NOTE, rig.watch)).toEqual({
        kind: "already_attempted",
      });
      expect(rig.printer.waiting).toEqual([]);
      expect(rig.ledger.state.outbox).toEqual([]);
    });

    it("sends the same credit note with the duplicate legend and the next order number", async () => {
      const rig = receiptRig([attempted()]);

      const printing = reprintReceipt(rig.ports, DUPLICATE_INPUT, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();

      expect(textOf(rig.printer.sent[0]?.bytes ?? new Uint8Array())).toBe(
        "STORED HEAD\nDUPLICATE 1\nSTORED BODY\n",
      );
      expect(await printing).toEqual({
        kind: "printed",
        copy: { kind: "duplicate", orderNumber: 1 },
      });
      expect(rig.template.creditNoteRenders).toEqual([]);
    });

    it("records the reprint of the credit note with the typed reason and who authorized it", async () => {
      const authority = new FakeOperationAuthority<ReceiptPrintGrant, typeof NOT_PERMITTED>({
        kind: "granted",
        grant: AUTHORIZED_GRANT,
      });
      const rig = receiptRig([attempted()], authority);
      rig.clock.set(SENT_AT);

      const printing = reprintReceipt(rig.ports, DUPLICATE_INPUT, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();
      await printing;

      const atSend = rig.printer.sent[0]?.ledgerStateWhenSent;
      expect(atSend?.sales[0]?.creditNote?.reprints).toEqual([
        {
          document: "credit_note",
          saleId: "sale-1",
          orderNumber: 1,
          requestedBy: "cashier",
          authorizedBy: "supervisor",
          reason: { kind: "requested", text: "el cliente la perdió" },
          occurredAt: SENT_AT,
        },
      ]);
      expect(atSend?.sales[0]?.reprints).toEqual([]);
      expect(atSend?.outbox).toEqual([
        {
          event_id: "id-1",
          aggregate_type: "Sale",
          aggregate_id: "sale-1",
          event_type: "reprint_recorded",
          schema_version: 2,
          payload: {
            sale_id: "sale-1",
            document: "credit_note",
            order_number: 1,
            requested_by: "cashier",
            authorized_by: "supervisor",
            reason_kind: "requested",
            reason_text: "el cliente la perdió",
          },
          occurred_at: SENT_AT.toISOString(),
          actor_id: "cashier",
        },
      ]);
    });

    it("numbers the duplicates of the credit note apart from the reprints of the sale's receipt", async () => {
      const receiptReprint = {
        document: "sale_receipt",
        saleId: "sale-1",
        orderNumber: 1,
        requestedBy: "cashier",
        authorizedBy: null,
        reason: { kind: "retry" },
        occurredAt: SENT_AT,
      } as const;
      const rig = receiptRig([
        creditedSale(
          { printAttemptedAt: FIRST_PRINT_AT, stored: STORED },
          { printAttemptedAt: FIRST_PRINT_AT, reprints: [receiptReprint, receiptReprint] },
        ),
      ]);

      for (const orderNumber of [1, 2]) {
        const printing = reprintReceipt(rig.ports, DUPLICATE_INPUT, rig.watch);
        await rig.printer.whenWaiting(orderNumber);
        rig.printer.becomeReady();
        expect(await printing).toEqual({
          kind: "printed",
          copy: { kind: "duplicate", orderNumber },
        });
      }
    });

    it("does not touch the print state of the sale's receipt", async () => {
      const rig = receiptRig([attempted()]);

      const printing = reprintReceipt(rig.ports, DUPLICATE_INPUT, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();
      await printing;

      expect(rig.ledger.state.sales[0]).toMatchObject({
        printAttemptedAt: null,
        printedAt: null,
        reprints: [],
      });
    });
  });

  describe("when it cannot print", () => {
    it.each([
      ["empty", ""],
      ["blank", "  \n "],
      ["too long", "a".repeat(RECEIPT_REPRINT_REASON_MAX_LENGTH + 1)],
    ])(
      "answers invalid_reason before authorizing or reading when the reason is %s",
      async (_name, reason) => {
        const rig = receiptRig([creditedSale({ printAttemptedAt: FIRST_PRINT_AT })]);

        expect(await reprintReceipt(rig.ports, { ...CREDIT_NOTE, reason }, rig.watch)).toEqual({
          kind: "invalid_reason",
          maxLength: RECEIPT_REPRINT_REASON_MAX_LENGTH,
        });
        expect(rig.ledger.transactions).toBe(0);
      },
    );

    it("returns the authority's refusal before reading any data or sending", async () => {
      const refusing = new FakeOperationAuthority<ReceiptPrintGrant, typeof NOT_PERMITTED>({
        kind: "refused",
        refusal: NOT_PERMITTED,
      });
      const rig = receiptRig([creditedSale({ printAttemptedAt: FIRST_PRINT_AT })], refusing);

      expect(await reprintReceipt(rig.ports, DUPLICATE_INPUT, rig.watch)).toEqual(NOT_PERMITTED);
      expect(rig.ledger.transactions).toBe(0);
      expect(rig.printer.sent).toEqual([]);
    });

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
      expect(await reprintReceipt(rig.ports, DUPLICATE_INPUT, rig.watch)).toEqual({
        kind: "not_found",
      });
      expect(rig.printer.sent).toEqual([]);
      expect(rig.ledger.state.outbox).toEqual([]);
    });

    it("answers unavailable and records nothing when the outbox is not ready", async () => {
      const rig = receiptRig([creditedSale({ printAttemptedAt: FIRST_PRINT_AT })]);
      rig.ledger.state.outboxReady = false;

      expect(await reprintReceipt(rig.ports, DUPLICATE_INPUT, rig.watch)).toEqual({
        kind: "unavailable",
      });
      expect(rig.ledger.state.sales[0]?.creditNote?.reprints).toEqual([]);
    });

    it("answers printer_not_configured and reads nothing when no printer is configured", async () => {
      const rig = receiptRig([creditedSale()]);
      rig.printers.unconfigure();

      expect(await printOriginalReceipt(rig.ports, CREDIT_NOTE, rig.watch)).toEqual({
        kind: "printer_not_configured",
      });
      expect(rig.ledger.transactions).toBe(0);
    });

    it("records nothing when the print is abandoned before the printer was ready", async () => {
      const rig = receiptRig([creditedSale({ printAttemptedAt: FIRST_PRINT_AT })]);

      const printing = reprintReceipt(rig.ports, DUPLICATE_INPUT, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.abandon();

      expect(await printing).toEqual({
        kind: "abandoned",
        copy: { kind: "duplicate", orderNumber: 1 },
      });
      expect(rig.ledger.state.sales[0]?.creditNote?.reprints).toEqual([]);
      expect(rig.ledger.state.outbox).toEqual([]);
    });
  });
});
