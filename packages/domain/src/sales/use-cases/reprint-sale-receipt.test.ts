import { describe, expect, it } from "vitest";
import type { ReceiptPrintGrant } from "./receipt-printing.js";
import { reprintSaleReceipt } from "./reprint-sale-receipt.js";
import { FakeOperationAuthority } from "./test-support/fake-operation-authority.js";
import { textOf } from "./test-support/fake-receipt-template.js";
import {
  ACKNOWLEDGED_AT,
  AUTHORIZED_GRANT,
  completedSale,
  FIRST_PRINT_AT,
  NOT_PERMITTED,
  receiptRig,
} from "./test-support/receipt-rig.js";

const INPUT = { saleId: "sale-1", reason: "el cliente la perdió" };

describe("reprintSaleReceipt", () => {
  it("returns the authority's refusal before reading any data or sending", async () => {
    const refusing = new FakeOperationAuthority<ReceiptPrintGrant, typeof NOT_PERMITTED>({
      kind: "refused",
      refusal: NOT_PERMITTED,
    });
    const rig = receiptRig([completedSale()], refusing);

    const outcome = await reprintSaleReceipt(rig.ports, INPUT, rig.watch);

    expect(outcome).toEqual(NOT_PERMITTED);
    expect(rig.ledger.transactions).toBe(0);
    expect(rig.printer.sent).toEqual([]);
  });

  it("prints a sale never printed as the original, with no reprint and no reason recorded", async () => {
    const rig = receiptRig();

    const printing = reprintSaleReceipt(rig.ports, INPUT, rig.watch);
    await rig.printer.whenSent();

    const atSend = rig.printer.sent[0]?.ledgerStateWhenSent;
    expect(atSend?.sales[0]?.printAttemptedAt).toEqual(FIRST_PRINT_AT);
    expect(atSend?.sales[0]?.reprints).toEqual([]);
    expect(atSend?.outbox.map(({ event_type }) => event_type)).toEqual([
      "sale_print_state_changed",
    ]);
    expect(textOf(rig.printer.sent[0]?.bytes ?? new Uint8Array())).toBe(
      "HEAD[v1] total 6750\nBODY 1 lines\n",
    );
    rig.printer.acknowledge();
    expect(await printing).toEqual({ kind: "printed", copy: { kind: "original" } });
  });

  it("records the reprint with the typed reason and who authorized it before sending the duplicate", async () => {
    const authority = new FakeOperationAuthority<ReceiptPrintGrant, typeof NOT_PERMITTED>({
      kind: "granted",
      grant: AUTHORIZED_GRANT,
    });
    const rig = receiptRig(
      [completedSale({ printAttemptedAt: FIRST_PRINT_AT, printedAt: FIRST_PRINT_AT })],
      authority,
    );
    rig.clock.set(ACKNOWLEDGED_AT);

    const printing = reprintSaleReceipt(rig.ports, INPUT, rig.watch);
    await rig.printer.whenSent();

    const atSend = rig.printer.sent[0]?.ledgerStateWhenSent;
    expect(atSend?.sales[0]?.reprints).toEqual([
      {
        saleId: "sale-1",
        orderNumber: 1,
        requestedBy: "cashier",
        authorizedBy: "supervisor",
        reason: { kind: "requested", text: "el cliente la perdió" },
        occurredAt: ACKNOWLEDGED_AT,
      },
    ]);
    expect(atSend?.outbox).toEqual([
      {
        event_id: "id-1",
        aggregate_type: "Sale",
        aggregate_id: "sale-1",
        event_type: "reprint_recorded",
        schema_version: 1,
        payload: {
          sale_id: "sale-1",
          order_number: 1,
          requested_by: "cashier",
          authorized_by: "supervisor",
          reason_kind: "requested",
          reason_text: "el cliente la perdió",
        },
        occurred_at: ACKNOWLEDGED_AT.toISOString(),
        actor_id: "cashier",
      },
    ]);
    expect(textOf(rig.printer.sent[0]?.bytes ?? new Uint8Array())).toBe(
      "HEAD[v1] total 6750\nDUPLICATE 1\nBODY 1 lines\n",
    );
    rig.printer.acknowledge();
    expect(await printing).toEqual({
      kind: "printed",
      copy: { kind: "duplicate", orderNumber: 1 },
    });
    expect(rig.ledger.state.sales[0]?.printedAt).toEqual(FIRST_PRINT_AT);
    expect(rig.ledger.state.outbox).toHaveLength(1);
  });

  it("numbers successive reprints 1, 2 and 3", async () => {
    const rig = receiptRig([completedSale({ printAttemptedAt: FIRST_PRINT_AT })]);

    for (let round = 1; round <= 3; round += 1) {
      const printing = reprintSaleReceipt(rig.ports, INPUT, rig.watch);
      await rig.printer.whenSent(round);
      rig.printer.abandon();
      expect(await printing).toEqual({
        kind: "abandoned",
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

    expect(await reprintSaleReceipt(rig.ports, INPUT, rig.watch)).toEqual({ kind: "not_found" });
    expect(rig.printer.sent).toEqual([]);
  });

  it("answers unavailable and records and sends nothing when the outbox is not ready", async () => {
    const rig = receiptRig([completedSale({ printAttemptedAt: FIRST_PRINT_AT })]);
    rig.ledger.state.outboxReady = false;

    expect(await reprintSaleReceipt(rig.ports, INPUT, rig.watch)).toEqual({
      kind: "unavailable",
    });
    expect(rig.printer.sent).toEqual([]);
    expect(rig.ledger.state.sales[0]?.reprints).toEqual([]);
    expect(rig.ledger.state.outbox).toEqual([]);
  });
});
