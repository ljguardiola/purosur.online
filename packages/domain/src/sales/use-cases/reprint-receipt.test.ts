import { describe, expect, it } from "vitest";
import { RECEIPT_REPRINT_REASON_MAX_LENGTH } from "../model/receipt-reprint-reason.js";
import type { ReceiptPrintGrant } from "./receipt-printing.js";
import { reprintReceipt } from "./reprint-receipt.js";
import { FakeOperationAuthority } from "./test-support/fake-operation-authority.js";
import { textOf } from "./test-support/fake-receipt-template.js";
import {
  AUTHORIZED_GRANT,
  completedSale,
  FIRST_PRINT_AT,
  NOT_PERMITTED,
  receiptRig,
  SENT_AT,
  voidedSale,
} from "./test-support/receipt-rig.js";

const INPUT = {
  document: "sale_receipt",
  saleId: "sale-1",
  reason: "el cliente la perdió",
} as const;

describe("reprintReceipt", () => {
  it("returns the authority's refusal before reading any data or sending", async () => {
    const refusing = new FakeOperationAuthority<ReceiptPrintGrant, typeof NOT_PERMITTED>({
      kind: "refused",
      refusal: NOT_PERMITTED,
    });
    const rig = receiptRig([completedSale()], refusing);

    const outcome = await reprintReceipt(rig.ports, INPUT, rig.watch);

    expect(outcome).toEqual(NOT_PERMITTED);
    expect(rig.ledger.transactions).toBe(0);
    expect(rig.printer.sent).toEqual([]);
  });

  it.each([
    ["empty", ""],
    ["blank", "  \n "],
    ["too long", "a".repeat(RECEIPT_REPRINT_REASON_MAX_LENGTH + 1)],
  ])(
    "answers invalid_reason before authorizing, reading or sending when the reason is %s",
    async (_name, reason) => {
      const rig = receiptRig([completedSale({ printAttemptedAt: FIRST_PRINT_AT })]);

      const outcome = await reprintReceipt(
        rig.ports,
        { document: "sale_receipt", saleId: "sale-1", reason },
        rig.watch,
      );

      expect(outcome).toEqual({
        kind: "invalid_reason",
        maxLength: RECEIPT_REPRINT_REASON_MAX_LENGTH,
      });
      expect(rig.ledger.transactions).toBe(0);
      expect(rig.printer.sent).toEqual([]);
    },
  );

  it("reprints the stored receipt of a sale even if its fiscal document is awaiting an answer again", async () => {
    const encoder = new TextEncoder();
    const sale = completedSale({
      printAttemptedAt: FIRST_PRINT_AT,
      stored: {
        templateVersion: "v1",
        head: encoder.encode("HEAD\n"),
        body: encoder.encode("BODY\n"),
      },
    });
    const rig = receiptRig([{ ...sale, source: { ...sale.source, fiscal: { kind: "awaiting" } } }]);

    const printing = reprintReceipt(rig.ports, INPUT, rig.watch);
    await rig.printer.whenWaiting();
    rig.printer.becomeReady();

    expect(await printing).toEqual({
      kind: "printed",
      copy: { kind: "duplicate", orderNumber: 1 },
    });
  });

  it("records the reason without the spaces around it", async () => {
    const rig = receiptRig([completedSale({ printAttemptedAt: FIRST_PRINT_AT })]);

    const printing = reprintReceipt(
      rig.ports,
      { document: "sale_receipt", saleId: "sale-1", reason: "  se mojó \n" },
      rig.watch,
    );
    await rig.printer.whenWaiting();
    rig.printer.becomeReady();

    expect(rig.printer.sent[0]?.ledgerStateWhenSent.sales[0]?.reprints[0]?.reason).toEqual({
      kind: "requested",
      text: "se mojó",
    });
    await printing;
  });

  it("prints a sale never printed as the original, with no reprint and no reason recorded", async () => {
    const rig = receiptRig();

    const printing = reprintReceipt(rig.ports, INPUT, rig.watch);
    await rig.printer.whenWaiting();
    rig.printer.becomeReady();

    const atSend = rig.printer.sent[0]?.ledgerStateWhenSent;
    expect(atSend?.sales[0]?.printAttemptedAt).toEqual(FIRST_PRINT_AT);
    expect(atSend?.sales[0]?.reprints).toEqual([]);
    expect(atSend?.sales[0]?.printedAt).toBeNull();
    expect(atSend?.outbox).toEqual([]);
    expect(textOf(rig.printer.sent[0]?.bytes ?? new Uint8Array())).toBe(
      "HEAD[v1] total 6750\nBODY 1 lines\n",
    );
    expect(await printing).toEqual({ kind: "printed", copy: { kind: "original" } });
    expect(rig.ledger.state.outbox.map(({ event_type }) => event_type)).toEqual([
      "sale_print_state_changed",
    ]);
  });

  it("records the reprint with the typed reason and who authorized it as it sends the duplicate", async () => {
    const authority = new FakeOperationAuthority<ReceiptPrintGrant, typeof NOT_PERMITTED>({
      kind: "granted",
      grant: AUTHORIZED_GRANT,
    });
    const rig = receiptRig(
      [completedSale({ printAttemptedAt: FIRST_PRINT_AT, printedAt: FIRST_PRINT_AT })],
      authority,
    );
    rig.clock.set(SENT_AT);

    const printing = reprintReceipt(rig.ports, INPUT, rig.watch);
    await rig.printer.whenWaiting();
    rig.printer.becomeReady();

    const atSend = rig.printer.sent[0]?.ledgerStateWhenSent;
    expect(atSend?.sales[0]?.reprints).toEqual([
      {
        document: "sale_receipt",
        saleId: "sale-1",
        orderNumber: 1,
        requestedBy: "cashier",
        authorizedBy: "supervisor",
        reason: { kind: "requested", text: "el cliente la perdió" },
        occurredAt: SENT_AT,
      },
    ]);
    expect(atSend?.outbox).toEqual([
      {
        event_id: "id-1",
        aggregate_type: "Sale",
        aggregate_id: "sale-1",
        event_type: "reprint_recorded",
        schema_version: 2,
        payload: {
          sale_id: "sale-1",
          document: "sale_receipt",
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
    expect(textOf(rig.printer.sent[0]?.bytes ?? new Uint8Array())).toBe(
      "HEAD[v1] total 6750\nDUPLICATE 1\nBODY 1 lines\n",
    );
    expect(await printing).toEqual({
      kind: "printed",
      copy: { kind: "duplicate", orderNumber: 1 },
    });
    expect(rig.ledger.state.sales[0]?.printedAt).toEqual(FIRST_PRINT_AT);
    expect(rig.ledger.state.outbox).toHaveLength(1);
  });

  it("answers abandoned and records nothing when the print is abandoned before the printer was ready", async () => {
    const rig = receiptRig([completedSale({ printAttemptedAt: FIRST_PRINT_AT })]);

    const printing = reprintReceipt(rig.ports, INPUT, rig.watch);
    await rig.printer.whenWaiting();
    rig.printer.abandon();

    expect(await printing).toEqual({
      kind: "abandoned",
      copy: { kind: "duplicate", orderNumber: 1 },
    });
    expect(rig.ledger.state.sales[0]?.reprints).toEqual([]);
    expect(rig.ledger.state.outbox).toEqual([]);
  });

  it("numbers successive reprints 1, 2 and 3", async () => {
    const rig = receiptRig([completedSale({ printAttemptedAt: FIRST_PRINT_AT })]);

    for (let round = 1; round <= 3; round += 1) {
      const printing = reprintReceipt(rig.ports, INPUT, rig.watch);
      await rig.printer.whenWaiting(round);
      rig.printer.becomeReady();
      expect(await printing).toEqual({
        kind: "printed",
        copy: { kind: "duplicate", orderNumber: round },
      });
    }

    expect(rig.ledger.state.sales[0]?.reprints.map(({ orderNumber }) => orderNumber)).toEqual([
      1, 2, 3,
    ]);
  });

  it.each([
    ["the sale does not exist", []],
    ["the sale is not completed", [completedSale({ completed: false })]],
  ])("answers not_found and sends nothing when %s", async (_name, sales) => {
    const rig = receiptRig(sales);

    expect(await reprintReceipt(rig.ports, INPUT, rig.watch)).toEqual({ kind: "not_found" });
    expect(rig.printer.sent).toEqual([]);
  });

  it("answers sale_voided and records and sends nothing for a voided sale", async () => {
    const rig = receiptRig([voidedSale({ printAttemptedAt: FIRST_PRINT_AT })]);

    expect(await reprintReceipt(rig.ports, INPUT, rig.watch)).toEqual({ kind: "sale_voided" });
    expect(rig.printer.sent).toEqual([]);
    expect(rig.ledger.state.sales[0]?.reprints).toEqual([]);
    expect(rig.ledger.state.sales[0]?.stored).toBeUndefined();
    expect(rig.ledger.state.outbox).toEqual([]);
  });

  it("answers printer_not_configured and records and sends nothing when no printer is configured", async () => {
    const rig = receiptRig([completedSale({ printAttemptedAt: FIRST_PRINT_AT })]);
    rig.printers.unconfigure();

    expect(await reprintReceipt(rig.ports, INPUT, rig.watch)).toEqual({
      kind: "printer_not_configured",
    });
    expect(rig.ledger.transactions).toBe(0);
    expect(rig.ledger.state.sales[0]?.reprints).toEqual([]);
    expect(rig.ledger.state.outbox).toEqual([]);
  });

  it("answers unavailable and records and sends nothing when the outbox is not ready", async () => {
    const rig = receiptRig([completedSale({ printAttemptedAt: FIRST_PRINT_AT })]);
    rig.ledger.state.outboxReady = false;

    expect(await reprintReceipt(rig.ports, INPUT, rig.watch)).toEqual({
      kind: "unavailable",
    });
    expect(rig.printer.sent).toEqual([]);
    expect(rig.ledger.state.sales[0]?.reprints).toEqual([]);
    expect(rig.ledger.state.outbox).toEqual([]);
  });
});
