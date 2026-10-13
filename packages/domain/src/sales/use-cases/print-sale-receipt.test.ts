import { describe, expect, it } from "vitest";
import { facturaCFiscalBlock } from "../../fiscal/index.js";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../../fiscal/test-support/fictional-tax-identities.js";
import type { ReceiptSource } from "../model/receipt-content.js";
import { authorizedFacturaC } from "../model/test-support/authorized-factura-c.js";
import { printSaleReceipt } from "./print-sale-receipt.js";
import type { ReceiptPrintGrant } from "./receipt-printing.js";
import { FakeOperationAuthority } from "./test-support/fake-operation-authority.js";
import { textOf } from "./test-support/fake-receipt-template.js";
import {
  AUTHORIZED_GRANT,
  completedSale,
  FIRST_PRINT_AT,
  NOT_PERMITTED,
  receiptRig,
  SENT_AT,
} from "./test-support/receipt-rig.js";

const ISSUER_IDENTITY = {
  legalName: FICTIONAL_LEGAL_NAME,
  cuit: FICTIONAL_CUIT,
  grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
};

function printStateEvent(id: string, printAttemptedAt: Date, printedAt: Date) {
  return {
    event_id: id,
    aggregate_type: "Sale",
    aggregate_id: "sale-1",
    event_type: "sale_print_state_changed",
    schema_version: 1,
    payload: {
      sale_id: "sale-1",
      print_attempted_at: printAttemptedAt.toISOString(),
      printed_at: printedAt.toISOString(),
    },
    occurred_at: printedAt.toISOString(),
    actor_id: "cashier",
  };
}

describe("printSaleReceipt", () => {
  describe("a sale with a fiscal document", () => {
    function saleWithFiscal(fiscal: ReceiptSource["fiscal"]) {
      return completedSale({ source: { ...completedSale().source, fiscal } });
    }

    it("answers unavailable, recording, rendering and sending nothing while the tax authority has not answered", async () => {
      const rig = receiptRig([saleWithFiscal({ kind: "awaiting" })]);

      expect(await printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch)).toEqual({
        kind: "unavailable",
      });
      expect(rig.template.renders).toEqual([]);
      expect(rig.printer.sent).toEqual([]);
      expect(rig.ledger.state.sales[0]).toMatchObject({
        printAttemptedAt: null,
        stored: undefined,
      });
      expect(rig.ledger.state.outbox).toEqual([]);
    });

    it("renders the receipt with the fiscal block of the authorized document", async () => {
      const authorized = authorizedFacturaC(7500, ISSUER_IDENTITY);
      const rig = receiptRig([saleWithFiscal({ kind: "authorized", authorized })]);

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();
      await printing;

      expect(rig.template.renders[0]?.fiscal).toEqual(facturaCFiscalBlock(authorized));
    });
  });

  describe("the first print of a sale", () => {
    it("records and sends nothing while the printer has not reported it is ready", async () => {
      const rig = receiptRig();

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.report("paper_out");

      expect(rig.printer.sent).toEqual([]);
      expect(rig.template.renders).toEqual([]);
      expect(rig.ledger.state.sales[0]).toMatchObject({
        printAttemptedAt: null,
        printedAt: null,
        stored: undefined,
        reprints: [],
      });
      expect(rig.ledger.state.outbox).toEqual([]);
      rig.printer.abandon();
      await printing;
    });

    it("records only the attempt, and stores the receipt, as it sends", async () => {
      const rig = receiptRig();

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();

      const atSend = rig.printer.sent[0]?.ledgerStateWhenSent;
      expect(atSend?.sales[0]?.printAttemptedAt).toEqual(FIRST_PRINT_AT);
      expect(atSend?.sales[0]?.printedAt).toBeNull();
      expect(atSend?.sales[0]?.stored?.templateVersion).toBe("v1");
      expect(atSend?.outbox).toEqual([]);
      await printing;
    });

    it("hands the printer the original, as the template prints it, with the status watch it was given", async () => {
      const rig = receiptRig();

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.report("paper_out");
      expect(rig.statuses).toEqual(["paper_out"]);
      rig.printer.becomeReady();
      await printing;

      expect(textOf(rig.printer.sent[0]?.bytes ?? new Uint8Array())).toBe(
        "HEAD[v1] total 6750\nBODY 1 lines\n",
      );
      expect(rig.printer.sent[0]?.watch).toBe(rig.watch);
    });

    it("records printed_at and the print-state event, in a transaction of their own, once the printer answers it was sent", async () => {
      const rig = receiptRig();

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();
      rig.clock.set(SENT_AT);
      const outcome = await printing;

      expect(outcome).toEqual({ kind: "printed", copy: { kind: "original" } });
      expect(rig.ledger.transactions).toBe(3);
      expect(rig.ledger.state.sales[0]).toMatchObject({
        printAttemptedAt: FIRST_PRINT_AT,
        printedAt: SENT_AT,
      });
      expect(rig.ledger.state.outbox).toEqual([printStateEvent("id-1", FIRST_PRINT_AT, SENT_AT)]);
    });

    it("keeps the attempt and leaves printed_at empty, with no print-state event, when the printer breaks after the bytes were handed to it", async () => {
      const rig = receiptRig();

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.breakAfterSending();

      await expect(printing).rejects.toThrow("the connection to the printer broke");
      expect(rig.ledger.state.sales[0]).toMatchObject({
        printAttemptedAt: FIRST_PRINT_AT,
        printedAt: null,
      });
      expect(rig.ledger.state.outbox).toEqual([]);
    });

    it("writes nothing when the print is abandoned before the printer was ready", async () => {
      const rig = receiptRig();

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.abandon();
      const outcome = await printing;

      expect(outcome).toEqual({ kind: "abandoned", copy: { kind: "original" } });
      expect(rig.ledger.transactions).toBe(1);
      expect(rig.ledger.state.sales[0]).toMatchObject({
        printAttemptedAt: null,
        printedAt: null,
        stored: undefined,
        reprints: [],
      });
      expect(rig.ledger.state.outbox).toEqual([]);
    });

    it("prints the original again after an abandoned print, with no reprint number consumed", async () => {
      const rig = receiptRig();
      const first = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting(1);
      rig.printer.abandon();
      await first;

      const second = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting(2);
      rig.printer.becomeReady();

      expect(await second).toEqual({ kind: "printed", copy: { kind: "original" } });
      expect(rig.ledger.state.sales[0]?.reprints).toEqual([]);
    });
  });

  describe("a copy decided before the printer was ready", () => {
    it("is recomputed as it sends, so the bytes match what was recorded", async () => {
      const rig = receiptRig();
      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting();
      const [sale] = rig.ledger.state.sales;
      if (sale !== undefined) {
        sale.printAttemptedAt = FIRST_PRINT_AT;
      }

      rig.printer.becomeReady();

      expect(await printing).toEqual({
        kind: "printed",
        copy: { kind: "duplicate", orderNumber: 1 },
      });
      expect(textOf(rig.printer.sent[0]?.bytes ?? new Uint8Array())).toBe(
        "HEAD[v1] total 6750\nDUPLICATE 1\nBODY 1 lines\n",
      );
      expect(rig.ledger.state.sales[0]?.reprints).toHaveLength(1);
    });

    it("fails when the sale is gone as the printer becomes ready", async () => {
      const rig = receiptRig();
      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting();
      rig.ledger.state.sales = [];

      expect(() => rig.printer.becomeReady()).toThrow("sale-1");
      rig.printer.abandon();
      await printing;
    });
  });

  describe("a print after an attempt that was never completed", () => {
    const attempted = completedSale({ printAttemptedAt: FIRST_PRINT_AT });

    it("is the first duplicate, recorded as a retry with its event, as it is sent", async () => {
      const rig = receiptRig([attempted]);
      rig.clock.set(SENT_AT);

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting();
      expect(rig.ledger.state.sales[0]?.reprints).toEqual([]);
      expect(rig.ledger.state.outbox).toEqual([]);
      rig.printer.becomeReady();

      const atSend = rig.printer.sent[0]?.ledgerStateWhenSent;
      const reprint = {
        saleId: "sale-1",
        orderNumber: 1,
        requestedBy: "cashier",
        authorizedBy: null,
        reason: { kind: "retry" },
        occurredAt: SENT_AT,
      };
      expect(atSend?.sales[0]?.reprints).toEqual([reprint]);
      expect(atSend?.outbox[0]).toEqual({
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
        occurred_at: SENT_AT.toISOString(),
        actor_id: "cashier",
      });
      expect(textOf(rig.printer.sent[0]?.bytes ?? new Uint8Array())).toBe(
        "HEAD[v1] total 6750\nDUPLICATE 1\nBODY 1 lines\n",
      );
      await printing;
    });

    it("keeps the attempt time and sets printed_at once the printer answers it was sent", async () => {
      const rig = receiptRig([attempted]);
      rig.clock.set(SENT_AT);

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();
      const outcome = await printing;

      const atSend = rig.printer.sent[0]?.ledgerStateWhenSent;
      expect(outcome).toEqual({ kind: "printed", copy: { kind: "duplicate", orderNumber: 1 } });
      expect(atSend?.sales[0]?.printedAt).toBeNull();
      expect(atSend?.outbox).toHaveLength(1);
      expect(rig.ledger.state.sales[0]?.printAttemptedAt).toEqual(FIRST_PRINT_AT);
      expect(rig.ledger.state.sales[0]?.printedAt).toEqual(SENT_AT);
      expect(rig.ledger.state.outbox[1]).toEqual(printStateEvent("id-2", FIRST_PRINT_AT, SENT_AT));
      expect(rig.ledger.transactions).toBe(3);
    });

    it("completes a print that broke after the bytes were handed over, as a duplicate with the earlier attempt time", async () => {
      const rig = receiptRig();
      const broken = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting(1);
      rig.printer.breakAfterSending();
      await expect(broken).rejects.toThrow();
      rig.clock.set(SENT_AT);

      const again = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting(2);
      rig.printer.becomeReady();

      expect(await again).toEqual({ kind: "printed", copy: { kind: "duplicate", orderNumber: 1 } });
      expect(rig.ledger.state.sales[0]?.printedAt).toEqual(SENT_AT);
      expect(rig.ledger.state.outbox.at(-1)).toEqual(
        printStateEvent("id-2", FIRST_PRINT_AT, SENT_AT),
      );
    });

    it("records who authorized the duplicate", async () => {
      const authority = new FakeOperationAuthority<ReceiptPrintGrant, typeof NOT_PERMITTED>({
        kind: "granted",
        grant: AUTHORIZED_GRANT,
      });
      const rig = receiptRig([attempted], authority);

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();
      await printing;

      expect(rig.ledger.state.sales[0]?.reprints[0]?.authorizedBy).toBe("supervisor");
      expect(rig.ledger.state.outbox[0]?.payload).toMatchObject({ authorized_by: "supervisor" });
    });

    it("does not overwrite a printed_at already set and emits no event for it", async () => {
      const printedBefore = new Date("2026-10-07T15:01:30.000Z");
      const rig = receiptRig([
        completedSale({ printAttemptedAt: FIRST_PRINT_AT, printedAt: printedBefore }),
      ]);
      rig.clock.set(SENT_AT);

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();
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
      await rig.printer.whenWaiting(round + 1);
      rig.printer.becomeReady();
      orders.push(await printing);
    }

    expect(orders).toEqual([
      { kind: "printed", copy: { kind: "original" } },
      { kind: "printed", copy: { kind: "duplicate", orderNumber: 1 } },
      { kind: "printed", copy: { kind: "duplicate", orderNumber: 2 } },
    ]);
    expect(rig.ledger.state.sales[0]?.reprints.map(({ orderNumber }) => orderNumber)).toEqual([
      1, 2,
    ]);
  });

  it("renders the receipt once and reuses the stored bytes in every later print", async () => {
    const rig = receiptRig();

    const first = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
    await rig.printer.whenWaiting(1);
    rig.printer.becomeReady();
    await first;
    rig.template.version = "v2";
    const second = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
    await rig.printer.whenWaiting(2);
    rig.printer.becomeReady();
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

    it("answers printer_not_configured and records and sends nothing when no printer is configured", async () => {
      const rig = receiptRig();
      rig.printers.unconfigure();

      const outcome = await printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);

      expect(outcome).toEqual({ kind: "printer_not_configured" });
      expect(rig.ledger.transactions).toBe(0);
      expect(rig.ledger.state.sales[0]?.printAttemptedAt).toBeNull();
      expect(rig.ledger.state.sales[0]?.stored).toBeUndefined();
      expect(rig.ledger.state.outbox).toEqual([]);
    });

    it("prints the original once a printer is configured after finding none", async () => {
      const rig = receiptRig();
      rig.printers.unconfigure();
      await printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      rig.printers.configure(rig.printer);

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();

      expect(await printing).toEqual({ kind: "printed", copy: { kind: "original" } });
    });

    it("asks for the configured printer once per print", async () => {
      const rig = receiptRig();

      const printing = printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);
      await rig.printer.whenWaiting();
      rig.printer.becomeReady();
      await printing;

      expect(rig.printers.asked).toBe(1);
    });

    it("asks for the printer only after the authority grants", async () => {
      const refusing = new FakeOperationAuthority<ReceiptPrintGrant, typeof NOT_PERMITTED>({
        kind: "refused",
        refusal: NOT_PERMITTED,
      });
      const rig = receiptRig([completedSale()], refusing);
      rig.printers.unconfigure();

      const outcome = await printSaleReceipt(rig.ports, { saleId: "sale-1" }, rig.watch);

      expect(outcome).toEqual(NOT_PERMITTED);
      expect(rig.printers.asked).toBe(0);
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
