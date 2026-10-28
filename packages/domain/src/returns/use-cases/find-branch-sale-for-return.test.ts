import { describe, expect, it } from "vitest";
import type { SaleInvoiceStanding } from "../../fiscal/index.js";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { TicketReference } from "../model/ticket-reference.js";
import { findBranchSaleForReturn } from "./find-branch-sale-for-return.js";
import type { BranchSaleLookupAnswer } from "./return-ports.js";
import {
  FakeBranchSaleLookup,
  FakeOwnReturns,
  FakeRetainedBranchSales,
} from "./test-support/fake-branch-sale.js";
import { FakeReturnLedger } from "./test-support/fake-return-ledger.js";
import { FixedClock } from "./test-support/fixed-clock.js";
import { aSaleForReturn, RETURNED_AT } from "./test-support/sale-for-return.js";

const BY_INVOICE: TicketReference = { kind: "invoice", pointOfSale: 3, number: 1204 };
const OTHER_REGISTER_INVOICE: TicketReference = { kind: "invoice", pointOfSale: 4, number: 88 };

function otherRegisterSale() {
  const { deferred: _deferred, ...facts } = aSaleForReturn({
    invoice: { pointOfSale: 4, number: 88 },
  });
  facts.sale.id = "sale-elsewhere";
  return facts;
}

const INVOICE_STANDING = {
  fiscalDocuments: [
    {
      origin: "real_time",
      state: "AUTHORIZED",
      pointOfSale: 4,
      number: 88,
      buyerTaxStatusCode: 5,
    },
  ],
  deferralPending: false,
} satisfies SaleInvoiceStanding;

function foundThroughCloud(
  overrides: Partial<{ countedReturnIds: string[]; invoiceStanding: SaleInvoiceStanding }> = {},
) {
  return {
    kind: "found",
    sale: otherRegisterSale(),
    invoiceStanding: INVOICE_STANDING,
    countedReturnIds: [],
    ...overrides,
  } satisfies BranchSaleLookupAnswer;
}

function find(
  answer: BranchSaleLookupAnswer,
  options: {
    search?: Parameters<typeof findBranchSaleForReturn>[1];
    own?: FakeOwnReturns;
    ledger?: FakeReturnLedger;
  } = {},
) {
  const lookup = new FakeBranchSaleLookup(answer);
  const retained = new FakeRetainedBranchSales();
  const outcome = findBranchSaleForReturn(
    {
      reader: options.ledger ?? new FakeReturnLedger({ sales: [aSaleForReturn()] }),
      lookup,
      ownReturns: options.own ?? new FakeOwnReturns(),
      retained,
      clock: new FixedClock(RETURNED_AT),
      zoneRules: new FakeZoneRulesSource(),
    },
    options.search ?? OTHER_REGISTER_INVOICE,
  );
  return { outcome, lookup, retained };
}

describe("findBranchSaleForReturn", () => {
  describe("a sale of this register", () => {
    it("answers with the sale without asking the cloud", async () => {
      const { outcome, lookup } = find({ kind: "unreachable" }, { search: BY_INVOICE });

      expect(await outcome).toMatchObject({ kind: "found", sale: { saleId: "sale-1" } });
      expect(lookup.asked).toEqual([]);
    });

    it("answers voided without asking the cloud", async () => {
      const gone = aSaleForReturn();
      gone.sale.state = "VOIDED";

      const { outcome, lookup } = find(
        { kind: "unreachable" },
        { search: BY_INVOICE, ledger: new FakeReturnLedger({ sales: [gone] }) },
      );

      expect(await outcome).toEqual({ kind: "voided" });
      expect(lookup.asked).toEqual([]);
    });

    it("keeps no copy", async () => {
      const { outcome, retained } = find({ kind: "unreachable" }, { search: BY_INVOICE });
      await outcome;

      expect(retained.kept).toEqual([]);
    });
  });

  describe("a sale this register does not have", () => {
    it("asks the cloud for the ticket", async () => {
      const { outcome, lookup } = find(foundThroughCloud());
      await outcome;

      expect(lookup.asked).toEqual([OTHER_REGISTER_INVOICE]);
    });

    it("finds the sale of another register of the branch, open for this branch's change-of-mind days", async () => {
      const { outcome } = find(foundThroughCloud(), {
        ledger: new FakeReturnLedger({ sales: [aSaleForReturn()], goodConditionReturnDays: 30 }),
      });

      expect(await outcome).toMatchObject({
        kind: "found",
        sale: {
          saleId: "sale-elsewhere",
          total: 21_500,
          invoice: { pointOfSale: 4, number: 88 },
          windows: { change_of_mind: { lastAllowedDay: "2026-10-12", open: true } },
        },
      });
    });

    it("keeps the copy of the sale as the cloud sent it, so the return can complete offline", async () => {
      const found = foundThroughCloud({ countedReturnIds: ["return-cloud"] });

      const { outcome, retained } = find(found);
      await outcome;

      expect(retained.kept).toEqual([
        {
          sale: found.sale,
          invoiceStanding: INVOICE_STANDING,
          ticket: OTHER_REGISTER_INVOICE,
          countedReturnIds: ["return-cloud"],
        },
      ]);
    });

    it("keeps the invoice standing of a sale whose invoice is still on its way", async () => {
      const onItsWay = { fiscalDocuments: [], deferralPending: true };

      const { outcome, retained } = find(foundThroughCloud({ invoiceStanding: onItsWay }));
      await outcome;

      expect(retained.kept[0]?.invoiceStanding).toEqual(onItsWay);
    });

    it("subtracts the returns this register made that the cloud did not count", async () => {
      const own = new FakeOwnReturns({
        "sale-elsewhere": [
          {
            id: "return-local",
            lines: [{ saleLineId: "line-1", quantity: 2, refundedAmount: 5000 }],
            refunds: [{ paymentId: "pay-cash", amount: 5000 }],
          },
        ],
      });

      const { outcome } = find(foundThroughCloud(), { own });

      const answer = await outcome;
      expect(answer.kind === "found" && answer.sale.lines[0]).toMatchObject({
        returnedQuantity: 2,
        returnableQuantity: 1,
      });
      expect(answer.kind === "found" && answer.sale.payments[0]).toMatchObject({
        refundedAmount: 5000,
        remaining: 10_000,
      });
    });

    it("does not subtract a return the cloud already counted", async () => {
      const own = new FakeOwnReturns({
        "sale-elsewhere": [
          {
            id: "return-local",
            lines: [{ saleLineId: "line-1", quantity: 2, refundedAmount: 5000 }],
            refunds: [],
          },
        ],
      });

      const { outcome } = find(foundThroughCloud({ countedReturnIds: ["return-local"] }), { own });

      const answer = await outcome;
      expect(answer.kind === "found" && answer.sale.lines[0]).toMatchObject({
        returnedQuantity: 0,
      });
    });

    it("finds a deferred ticket's sale through the cloud too", async () => {
      const deferred: TicketReference = { kind: "deferred", id: "d-9", shortCode: "AAAA1111" };

      const { outcome, lookup } = find(foundThroughCloud(), { search: deferred });

      expect(await outcome).toMatchObject({ kind: "found" });
      expect(lookup.asked).toEqual([deferred]);
    });

    it("answers not found when the cloud has no such sale in the branch", async () => {
      const { outcome, retained } = find({ kind: "not_found" });

      expect(await outcome).toEqual({ kind: "not_found" });
      expect(retained.kept).toEqual([]);
    });

    it("answers that it needs a connection when the cloud cannot be reached", async () => {
      const { outcome, retained } = find({ kind: "unreachable" });

      expect(await outcome).toEqual({ kind: "needs_connection" });
      expect(retained.kept).toEqual([]);
    });

    it("answers that the lookup failed when the cloud was reached but could not answer with the sale", async () => {
      const { outcome, retained } = find({ kind: "failed" });

      expect(await outcome).toEqual({ kind: "lookup_failed" });
      expect(retained.kept).toEqual([]);
    });

    it("answers voided for a voided sale of another register and keeps no copy of it", async () => {
      const voided = foundThroughCloud();
      voided.sale.sale.state = "VOIDED";

      const { outcome, retained } = find(voided);

      expect(await outcome).toEqual({ kind: "voided" });
      expect(retained.kept).toEqual([]);
    });

    it("answers not found for a sale of the cloud that was never completed and keeps no copy", async () => {
      const open = foundThroughCloud();
      open.sale.sale.state = "OPEN";

      const { outcome, retained } = find(open);

      expect(await outcome).toEqual({ kind: "not_found" });
      expect(retained.kept).toEqual([]);
    });

    it("never asks the cloud for a sale the cashier already confirmed by its id", async () => {
      const { outcome, lookup } = find(foundThroughCloud(), {
        search: { kind: "sale", saleId: "sale-9" },
      });

      expect(await outcome).toEqual({ kind: "not_found" });
      expect(lookup.asked).toEqual([]);
    });
  });
});
