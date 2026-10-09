import { describe, expect, it } from "vitest";
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
import { printSaleReceipt } from "./print-sale-receipt.js";
import type { ReceiptPrintGrant } from "./receipt-printing.js";

function printStateEvent(id: string, printAttemptedAt: Date, printedAt: Date | null, at: Date) {
  return {
    event_id: id,
    aggregate_type: "Sale",
    aggregate_id: "sale-1",
    event_type: "sale_print_state_changed",
    schema_version: 1,
    payload: {
      sale_id: "sale-1",
      print_attempted_at: printAttemptedAt.toISOString(),
      printed_at: printedAt?.toISOString() ?? null,
    },
    occurred_at: at.toISOString(),
    actor_id: "cashier",
  };
}

describe("printSaleReceipt", () => {
  describe("the first print of a sale", () => {
    it("records the attempt and its event, and stores the receipt, before anything is sent", async () => {
      const rig = receiptRig();

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenSent();

      const atSend = rig.printer.sent[0]?.ledgerStateWhenSent;
      expect(atSend?.sales[0]?.printAttemptedAt).toEqual(FIRST_PRINT_AT);
      expect(atSend?.sales[0]?.printedAt).toBeNull();
      expect(atSend?.sales[0]?.stored?.templateVersion).toBe("v1");
      expect(atSend?.outbox).toEqual([printStateEvent("id-1", FIRST_PRINT_AT, null, FIRST_PRINT_AT)]);
      rig.printer.acknowledge();
      await printing;
    });

    it("sends the original, as the template prints it, with the status watch it was given", async () => {
      const rig = receiptRig();

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenSent();

      expect(textOf(rig.printer.sent[0]?.bytes ?? new Uint8Array())).toBe(
        "HEAD[v1] total 6750\nBODY 1 lines\n",
      );
      expect(rig.printer.sent[0]?.watch).toBe(rig.watch);
      rig.printer.report("paper_out");
      expect(rig.statuses).toEqual(["paper_out"]);
      rig.printer.acknowledge();
      await printing;
    });

    it("writes printed_at only when the printer acknowledges, not when the send returns", async () => {
      const rig = receiptRig();

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenSent();
      await Promise.resolve();

      expect(rig.ledger.state.sales[0]?.printedAt).toBeNull();
      expect(rig.ledger.state.outbox).toHaveLength(1);

      rig.clock.set(ACKNOWLEDGED_AT);
      rig.printer.acknowledge();
      const outcome = await printing;

      expect(outcome).toEqual({ kind: "printed", copy: { kind: "original" } });
      expect(rig.ledger.state.sales[0]?.printedAt).toEqual(ACKNOWLEDGED_AT);
      expect(rig.ledger.state.outbox[1]).toEqual(
        printStateEvent("id-2", FIRST_PRINT_AT, ACKNOWLEDGED_AT, ACKNOWLEDGED_AT),
      );
    });

    it("writes nothing more when the print is abandoned", async () => {
      const rig = receiptRig();

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenSent();
      rig.printer.abandon();
      const outcome = await printing;

      expect(outcome).toEqual({ kind: "abandoned", copy: { kind: "original" } });
      expect(rig.ledger.transactions).toBe(1);
      expect(rig.ledger.state.sales[0]?.printedAt).toBeNull();
      expect(rig.ledger.state.sales[0]?.printAttemptedAt).toEqual(FIRST_PRINT_AT);
      expect(rig.ledger.state.outbox).toHaveLength(1);
    });
  });

  describe("a retry after an attempt that was never acknowledged", () => {
    const attempted = completedSale({ printAttemptedAt: FIRST_PRINT_AT });

    it("is the first duplicate, recorded as a retry with its event, before it is sent", async () => {
      const rig = receiptRig([attempted]);
      rig.clock.set(ACKNOWLEDGED_AT);

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenSent();

      const atSend = rig.printer.sent[0]?.ledgerStateWhenSent;
      const reprint = {
        saleId: "sale-1",
        orderNumber: 1,
        requestedBy: "cashier",
        authorizedBy: null,
        reason: { kind: "retry" },
        occurredAt: ACKNOWLEDGED_AT,
      };
      expect(atSend?.sales[0]?.reprints).toEqual([reprint]);
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
            authorized_by: null,
            reason_kind: "retry",
            reason_text: null,
          },
          occurred_at: ACKNOWLEDGED_AT.toISOString(),
          actor_id: "cashier",
        },
      ]);
      expect(textOf(rig.printer.sent[0]?.bytes ?? new Uint8Array())).toBe(
        "HEAD[v1] total 6750\nDUPLICATE 1\nBODY 1 lines\n",
      );
      rig.printer.acknowledge();
      await printing;
    });

    it("keeps the attempt time and sets printed_at when the retry is acknowledged", async () => {
      const rig = receiptRig([attempted]);
      rig.clock.set(ACKNOWLEDGED_AT);

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenSent();
      rig.printer.acknowledge();
      const outcome = await printing;

      expect(outcome).toEqual({ kind: "printed", copy: { kind: "duplicate", orderNumber: 1 } });
      expect(rig.ledger.state.sales[0]?.printAttemptedAt).toEqual(FIRST_PRINT_AT);
      expect(rig.ledger.state.sales[0]?.printedAt).toEqual(ACKNOWLEDGED_AT);
      expect(rig.ledger.state.outbox[1]).toEqual(
        printStateEvent("id-2", FIRST_PRINT_AT, ACKNOWLEDGED_AT, ACKNOWLEDGED_AT),
      );
    });

    it("records who authorized the retry", async () => {
      const authority = new FakeOperationAuthority<ReceiptPrintGrant, typeof NOT_PERMITTED>({
        kind: "granted",
        grant: AUTHORIZED_GRANT,
      });
      const rig = receiptRig([attempted], authority);

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenSent();
      rig.printer.abandon();
      await printing;

      expect(rig.ledger.state.sales[0]?.reprints[0]?.authorizedBy).toBe("supervisor");
      expect(rig.ledger.state.outbox[0]?.payload.authorized_by).toBe("supervisor");
    });

    it("does not overwrite a printed_at already set and emits no event for it", async () => {
      const printedBefore = new Date("2026-10-07T15:01:30.000Z");
      const rig = receiptRig([completedSale({ printAttemptedAt: FIRST_PRINT_AT, printedAt: printedBefore })]);
      rig.clock.set(ACKNOWLEDGED_AT);

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenSent();
      rig.printer.acknowledge();
      const outcome = await printing;

      expect(outcome).toEqual({ kind: "printed", copy: { kind: "duplicate", orderNumber: 1 } });
      expect(rig.ledger.state.sales[0]?.printedAt).toEqual(printedBefore);
      expect(rig.ledger.state.outbox.map(({ event_type }) => event_type)).toEqual([
        "reprint_recorded",
      ]);
    });
  });

  it("numbers each later duplicate after the sale's previous reprints", async () => {
    const rig = receiptRig();
    const orders: unknown[] = [];

    for (let round = 0; round < 3; round += 1) {
      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenSent(round + 1);
      rig.printer.abandon();
      orders.push(await printing);
    }

    expect(orders).toEqual([
      { kind: "abandoned", copy: { kind: "original" } },
      { kind: "abandoned", copy: { kind: "duplicate", orderNumber: 1 } },
      { kind: "abandoned", copy: { kind: "duplicate", orderNumber: 2 } },
    ]);
    expect(rig.ledger.state.sales[0]?.reprints.map(({ orderNumber }) => orderNumber)).toEqual([
      1, 2,
    ]);
  });

  it("renders the receipt once and reuses the stored bytes in every later print", async () => {
    const rig = receiptRig();

    const first = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
    await rig.printer.whenSent(1);
    rig.printer.abandon();
    await first;
    rig.template.version = "v2";
    const second = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
    await rig.printer.whenSent(2);
    rig.printer.abandon();
    await second;

    expect(rig.template.renders).toHaveLength(1);
    expect(textOf(rig.printer.sent[1]?.bytes ?? new Uint8Array())).toBe(
      "HEAD[v1] total 6750\nDUPLICATE 1\nBODY 1 lines\n",
    );
    expect(rig.ledger.state.sales[0]?.stored?.templateVersion).toBe("v1");
  });

  describe("when it cannot print", () => {
    it("returns the authority's refusal before reading any data or sending", async () => {
      const refusing = new FakeOperationAuthority<ReceiptPrintGrant, typeof NOT_PERMITTED>({
        kind: "refused",
        refusal: NOT_PERMITTED,
      });
      const rig = receiptRig([completedSale()], refusing);

      const outcome = await printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);

      expect(outcome).toEqual(NOT_PERMITTED);
      expect(refusing.asked).toBe(1);
      expect(rig.ledger.transactions).toBe(0);
      expect(rig.printer.sent).toEqual([]);
    });

    it.each([
      ["the sale does not exist", []],
      ["the sale is not completed", [completedSale({ completed: false })]],
    ])("answers not_found and sends nothing when %s", async (_name, sales) => {
      const rig = receiptRig(sales);

      const outcome = await printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);

      expect(outcome).toEqual({ kind: "not_found" });
      expect(rig.printer.sent).toEqual([]);
      expect(rig.ledger.state.outbox).toEqual([]);
    });

    it("answers unavailable and records and sends nothing when the outbox is not ready", async () => {
      const rig = receiptRig();
      rig.ledger.state.outboxReady = false;

      const outcome = await printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);

      expect(outcome).toEqual({ kind: "unavailable" });
      expect(rig.printer.sent).toEqual([]);
      expect(rig.ledger.state.sales[0]?.printAttemptedAt).toBeNull();
      expect(rig.ledger.state.sales[0]?.stored).toBeUndefined();
      expect(rig.ledger.state.outbox).toEqual([]);
    });
  });
});
