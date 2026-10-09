import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { dependenciesOf, invariantBreaksOf } from "./synced-fact.js";
import {
  A_CASH_MOVEMENT_FACT,
  A_GATE_FAILED_FACT,
  A_SESSION_CLOSED_FACT,
  A_SESSION_OPENED_FACT,
  aCancelledSaleFact,
  aCompletedSaleFact,
} from "./test-support/synced-facts.js";

describe("what a synced fact needs applied before it", () => {
  it("is the cash session a completed sale was made in", () => {
    expect(dependenciesOf(aCompletedSaleFact({ sessionId: "session-9" }))).toEqual([
      { aggregateType: "CashSession", aggregateId: "session-9" },
    ]);
  });

  it("is the cash session a cancelled sale was made in", () => {
    expect(dependenciesOf(aCancelledSaleFact({ sessionId: "session-9" }))).toEqual([
      { aggregateType: "CashSession", aggregateId: "session-9" },
    ]);
  });

  it("is nothing outside its own aggregate for the events of a cash session", () => {
    expect(dependenciesOf(A_SESSION_OPENED_FACT)).toEqual([]);
    expect(dependenciesOf(A_SESSION_CLOSED_FACT)).toEqual([]);
    expect(dependenciesOf(A_CASH_MOVEMENT_FACT)).toEqual([]);
  });

  it("is nothing for a failed fiscal gate", () => {
    expect(dependenciesOf(A_GATE_FAILED_FACT)).toEqual([]);
  });
});

describe("what a synced fact breaks that only its own history shows", () => {
  it("is that its approved payments are below the total for a sale not fully paid", () => {
    const sale = aCompletedSaleFact({ total: 1501 });

    expect(invariantBreaksOf(sale)).toEqual(["approved_payments_below_total"]);
  });

  it("is nothing for a sale whose approved payments cover the total", () => {
    expect(invariantBreaksOf(aCompletedSaleFact())).toEqual([]);
  });

  it("is nothing for a sale whose stock movements match its lines", () => {
    const sale = aCompletedSaleFact({
      stockMovements: [
        { id: "movement-1", saleLineId: "line-1", productId: "product-1", delta: -1000 },
      ],
    });

    expect(invariantBreaksOf(sale)).toEqual([]);
  });

  it("is that its stock movements do not match its lines for a sale moving another product", () => {
    const sale = aCompletedSaleFact({
      stockMovements: [
        { id: "movement-1", saleLineId: "line-1", productId: "product-2", delta: -1000 },
      ],
    });

    expect(invariantBreaksOf(sale)).toEqual(["stock_movements_do_not_match_lines"]);
  });

  it("is that its stock movements do not match its lines for a sale reporting none of them", () => {
    expect(invariantBreaksOf(aCompletedSaleFact({ stockMovements: [] }))).toEqual([
      "stock_movements_do_not_match_lines",
    ]);
  });

  it("is nothing about stock for a sale whose register reports no stock movements", () => {
    expect(invariantBreaksOf(aCompletedSaleFact({ stockMovements: null }))).toEqual([]);
  });

  it("is every break a sale has", () => {
    const sale = aCompletedSaleFact({ total: 1501, stockMovements: [] });

    expect(invariantBreaksOf(sale)).toEqual([
      "approved_payments_below_total",
      "stock_movements_do_not_match_lines",
    ]);
  });

  it("is nothing for a cancelled sale whose refunds settle each approved payment", () => {
    expect(invariantBreaksOf(aCancelledSaleFact())).toEqual([]);
  });

  it("is that the refunds do not match the payments for a cancelled sale missing a refund", () => {
    expect(invariantBreaksOf(aCancelledSaleFact({ refunds: [] }))).toEqual([
      "refunds_do_not_match_payments",
    ]);
  });

  it("is that the refunds do not match the payments for a refund of another amount", () => {
    const sale = aCancelledSaleFact();
    const refunds = sale.sale.refunds.map((refund) => ({ ...refund, amount: 999 }));

    expect(invariantBreaksOf(aCancelledSaleFact({ refunds }))).toEqual([
      "refunds_do_not_match_payments",
    ]);
  });

  it("is nothing for any other fact", () => {
    expect(invariantBreaksOf(A_SESSION_OPENED_FACT)).toEqual([]);
    expect(invariantBreaksOf(A_SESSION_CLOSED_FACT)).toEqual([]);
    expect(invariantBreaksOf(A_CASH_MOVEMENT_FACT)).toEqual([]);
    expect(invariantBreaksOf(A_GATE_FAILED_FACT)).toEqual([]);
  });

  it("never flags a sale whose lines' frozen prices differ from any price list, since the fact holds no current price to compare", () => {
    const base = aCompletedSaleFact();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.string(),
        (frozenPrice, priceListId) => {
          const lines = base.sale.lines.map((line) => ({
            ...line,
            listUnitPrice: frozenPrice,
            priceListId,
          }));
          const sale = aCompletedSaleFact({ lines });

          expect(invariantBreaksOf(sale)).toEqual(invariantBreaksOf(base));
        },
      ),
    );
  });
});
