import { describe, expect, it } from "vitest";
import type { DeferredSaleFacts } from "../model/deferred-sale-lookup.js";
import type { DeferredSaleInvoicingOutcome } from "./deferred-sale-lookup-ports.js";
import { printDeferredSaleInvoice } from "./print-deferred-sale-invoice.js";
import type { ReceiptPrintGrant } from "./receipt-printing.js";
import {
  deferredSaleFacts,
  FakeDeferredSaleInvoicing,
  FakeDeferredSaleLookup,
} from "./test-support/fake-deferred-sale-lookup.js";
import { FakeOperationAuthority } from "./test-support/fake-operation-authority.js";
import { completedSale, NOT_PERMITTED, receiptRig, SENT_AT } from "./test-support/receipt-rig.js";

const ISSUED = { kind: "issued", pointOfSale: 12, number: 101 } as const;

function scenario(
  facts: DeferredSaleFacts = deferredSaleFacts(),
  invoicingAnswer: DeferredSaleInvoicingOutcome = { kind: "invoiced" },
  rig = receiptRig(),
  issuesWhenAsked = invoicingAnswer.kind === "invoiced",
) {
  const lookup = new FakeDeferredSaleLookup([facts]);
  const invoicing = new FakeDeferredSaleInvoicing(invoicingAnswer, (saleId) => {
    if (issuesWhenAsked) {
      lookup.invoice(saleId, 12, 101);
    }
  });
  const ports = { ...rig.ports, lookup, invoicing };
  const printing = printDeferredSaleInvoice(ports, { saleId: "sale-1" }, rig.watch);
  return { rig, lookup, invoicing, printing };
}

async function printWhenReady({ rig, printing }: ReturnType<typeof scenario>) {
  await rig.printer.whenWaiting();
  rig.printer.becomeReady();
  rig.clock.set(SENT_AT);
  return printing;
}

describe("printDeferredSaleInvoice", () => {
  describe("a sale that is already invoiced", () => {
    it("prints its invoice as an original without invoicing anything", async () => {
      const run = scenario(deferredSaleFacts({ invoice: ISSUED }));

      expect(await printWhenReady(run)).toEqual({ kind: "printed", copy: { kind: "original" } });
      expect(run.invoicing.invoicedUpTo).toEqual([]);
      expect(run.rig.ledger.state.sales[0]?.deferredInvoice?.printedAt).toEqual(SENT_AT);
      expect(run.rig.ledger.state.sales[0]?.printedAt).toBeNull();
    });

    it("says the invoice was already printed once its original was attempted", async () => {
      const rig = receiptRig([
        completedSale({
          deferredInvoice: {
            printAttemptedAt: SENT_AT,
            printedAt: null,
            stored: undefined,
            reprints: [],
          },
        }),
      ]);
      const run = scenario(
        deferredSaleFacts({ invoice: ISSUED, originalPrintAttempted: true }),
        undefined,
        rig,
      );

      expect(await run.printing).toEqual({ kind: "already_printed" });
      expect(rig.printer.sent).toEqual([]);
    });
  });

  describe("a sale still to be invoiced", () => {
    it("invoices the backlog up to that sale and then prints its invoice as an original", async () => {
      const run = scenario();

      expect(await printWhenReady(run)).toEqual({ kind: "printed", copy: { kind: "original" } });
      expect(run.invoicing.invoicedUpTo).toEqual(["sale-1"]);
      expect(run.rig.printer.sent).toHaveLength(1);
    });

    it("prints the invoice when the sale was already invoiced by the time the backlog ran", async () => {
      const run = scenario(undefined, { kind: "not_pending" }, undefined, true);

      expect(await printWhenReady(run)).toEqual({ kind: "printed", copy: { kind: "original" } });
    });

    it.each([
      { kind: "not_yet", cause: "cannot_authorize" },
      { kind: "not_yet", cause: "older_sale_blocking" },
      { kind: "not_yet", cause: "not_authorized" },
    ] as const)("prints nothing and says it cannot be invoiced yet: $cause", async (answer) => {
      const run = scenario(undefined, answer);

      expect(await run.printing).toEqual(answer);
      expect(run.rig.ledger.transactions).toBe(0);
      expect(run.rig.printer.waiting).toEqual([]);
    });

    it("is expired, printing nothing, when the backlog no longer holds the sale but it was never invoiced", async () => {
      const run = scenario(undefined, { kind: "not_pending" });

      expect(await run.printing).toEqual({ kind: "expired" });
      expect(run.rig.printer.waiting).toEqual([]);
    });

    it("is voided when the sale was voided while it was being invoiced", async () => {
      const lookup = new FakeDeferredSaleLookup([deferredSaleFacts()]);
      const invoicing = new FakeDeferredSaleInvoicing({ kind: "invoiced" }, (saleId) =>
        lookup.void(saleId),
      );
      const rig = receiptRig();

      const outcome = await printDeferredSaleInvoice(
        { ...rig.ports, lookup, invoicing },
        { saleId: "sale-1" },
        rig.watch,
      );

      expect(outcome).toEqual({ kind: "voided" });
      expect(rig.printer.waiting).toEqual([]);
    });
  });

  describe("a sale that cannot be invoiced", () => {
    it("is not found when no deferred sale has that id", async () => {
      const lookup = new FakeDeferredSaleLookup([]);
      const invoicing = new FakeDeferredSaleInvoicing({ kind: "invoiced" });
      const rig = receiptRig();

      expect(
        await printDeferredSaleInvoice(
          { ...rig.ports, lookup, invoicing },
          { saleId: "sale-1" },
          rig.watch,
        ),
      ).toEqual({ kind: "not_found" });
      expect(invoicing.invoicedUpTo).toEqual([]);
    });

    it.each([
      ["its deferred record is cancelled", { cancelled: true }, "voided"],
      ["its sale is voided", { saleVoided: true }, "voided"],
      ["its window ran out", { occurredAt: new Date("2026-09-01T12:00:00.000Z") }, "expired"],
      [
        "dated before the last issued document",
        { lastIssuedOn: "2026-10-08" },
        "out_of_date_order",
      ],
    ] as const)("is %s: invoices and prints nothing", async (_case, overrides, kind) => {
      const run = scenario(deferredSaleFacts(overrides));

      expect(await run.printing).toEqual({ kind });
      expect(run.invoicing.invoicedUpTo).toEqual([]);
      expect(run.rig.printer.waiting).toEqual([]);
    });
  });

  describe("authorization", () => {
    it("is asked once, before anything is read, and its refusal ends the operation", async () => {
      const authority = new FakeOperationAuthority<ReceiptPrintGrant, typeof NOT_PERMITTED>({
        kind: "refused",
        refusal: NOT_PERMITTED,
      });
      const run = scenario(undefined, undefined, receiptRig([completedSale()], authority));

      expect(await run.printing).toEqual(NOT_PERMITTED);
      expect(authority.asked).toBe(1);
      expect(run.lookup.searches).toEqual([]);
      expect(run.invoicing.invoicedUpTo).toEqual([]);
    });

    it("is asked only once for a whole invoice and print", async () => {
      const run = scenario();
      await printWhenReady(run);

      expect(run.rig.authority.asked).toBe(1);
    });
  });

  it("returns the printer's outcome unchanged when no printer is configured", async () => {
    const rig = receiptRig();
    rig.printers.unconfigure();
    const run = scenario(deferredSaleFacts({ invoice: ISSUED }), undefined, rig);

    expect(await run.printing).toEqual({ kind: "printer_not_configured" });
  });

  it("returns the abandoned outcome when the print is abandoned before the printer was ready", async () => {
    const run = scenario(deferredSaleFacts({ invoice: ISSUED }));
    await run.rig.printer.whenWaiting();
    run.rig.printer.abandon();

    expect(await run.printing).toEqual({ kind: "abandoned", copy: { kind: "original" } });
  });
});
