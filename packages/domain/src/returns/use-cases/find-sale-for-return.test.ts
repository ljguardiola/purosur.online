import { describe, expect, it } from "vitest";
import { settledLines } from "../../sales/index.js";
import type { ZoneRules } from "../../shared/index.js";
import { argentinaInstant, FIXED_ARGENTINA_ZONE_RULES } from "../../shared/index.js";
import {
  FakeZoneRulesSource,
  fixedOffsetZoneRules,
} from "../../shared/test-support/fake-zone-rules-source.js";
import { type FindSaleForReturnInput, findSaleForReturn } from "./find-sale-for-return.js";
import { FakeReturnLedger, type FakeReturnLedgerState } from "./test-support/fake-return-ledger.js";
import { FixedClock } from "./test-support/fixed-clock.js";
import {
  aSaleForReturn,
  CASH_PAYMENT,
  RETURNED_AT,
  TRANSFER_PAYMENT,
} from "./test-support/sale-for-return.js";

function find(
  state: Partial<FakeReturnLedgerState>,
  search: FindSaleForReturnInput,
  now: Date = RETURNED_AT,
  zoneRules?: ZoneRules,
) {
  const ledger = new FakeReturnLedger({ sales: [aSaleForReturn()], ...state });
  return findSaleForReturn(
    { reader: ledger, clock: new FixedClock(now), zoneRules: new FakeZoneRulesSource(zoneRules) },
    search,
  );
}

const BY_INVOICE: FindSaleForReturnInput = { kind: "invoice", pointOfSale: 3, number: 1204 };

describe("findSaleForReturn", () => {
  describe("finding the sale", () => {
    it("finds the sale of a factura C by its point of sale and number", () => {
      expect(find({}, BY_INVOICE)).toMatchObject({ kind: "found", sale: { saleId: "sale-1" } });
    });

    it("finds the sale of a deferred ticket by what its QR carries", () => {
      expect(find({}, { kind: "deferred", id: "deferred-1", shortCode: "7KQ4M2P9" })).toMatchObject(
        {
          kind: "found",
          sale: { saleId: "sale-1" },
        },
      );
    });

    it("finds the sale again by its id once the cashier confirmed it", () => {
      expect(find({}, { kind: "sale", saleId: "sale-1" })).toMatchObject({
        kind: "found",
        sale: { saleId: "sale-1" },
      });
    });

    it.each([
      ["a point of sale it does not have", { kind: "invoice", pointOfSale: 4, number: 1204 }],
      ["a number it does not have", { kind: "invoice", pointOfSale: 3, number: 1205 }],
      ["a deferred ticket it does not have", { kind: "deferred", id: "x", shortCode: "7KQ4M2P9" }],
      ["a sale it does not have", { kind: "sale", saleId: "sale-9" }],
    ] as const)("answers that this register has no sale for %s", (_name, search) => {
      expect(find({}, search)).toEqual({ kind: "not_found" });
    });

    it("answers not found for a sale that was never completed", () => {
      const open = aSaleForReturn();
      open.sale.state = "OPEN";

      expect(find({ sales: [open] }, BY_INVOICE)).toEqual({ kind: "not_found" });
    });

    it.each(["VOIDED", "CANCELLED"] as const)("answers voided for a %s sale", (state) => {
      const gone = aSaleForReturn();
      gone.sale.state = state;

      expect(find({ sales: [gone] }, BY_INVOICE)).toEqual({ kind: "voided" });
    });
  });

  describe("what the cashier confirms against the paper", () => {
    it("shows the sale's date, its total after the sale's discount and its invoice", () => {
      expect(find({}, BY_INVOICE)).toMatchObject({
        kind: "found",
        sale: {
          saleId: "sale-1",
          occurredAt: aSaleForReturn().occurredAt,
          total: 21_500,
          invoice: { pointOfSale: 3, number: 1204 },
        },
      });
    });

    it("charges the total of a sale with a discount on its total", () => {
      const discounted = aSaleForReturn();
      discounted.sale.lines = settledLines({
        lines: discounted.sale.lines,
        saleDiscount: {
          kind: "AMOUNT",
          amount: 1500,
          reason: "cliente frecuente",
          authorizedBy: null,
        },
      });

      expect(find({ sales: [discounted] }, BY_INVOICE)).toMatchObject({
        sale: { total: 20_000 },
      });
    });

    it("shows no invoice for a sale that has none", () => {
      expect(
        find({ sales: [aSaleForReturn({ invoice: null })] }, { kind: "sale", saleId: "sale-1" }),
      ).toMatchObject({
        sale: { invoice: null },
      });
    });
  });

  describe("the lines", () => {
    it("lists each line with what it sold, what it charged and what can still come back", () => {
      const outcome = find({}, BY_INVOICE);

      expect(outcome.kind === "found" && outcome.sale.lines).toEqual([
        {
          id: "line-1",
          productId: "yerba",
          productName: "Yerba 1 kg",
          saleUnit: "UNIT",
          soldQuantity: 3,
          returnedQuantity: 0,
          returnableQuantity: 3,
          chargedAmount: 7500,
          refundedAmount: 0,
          mustBeReturnedWhole: false,
        },
        {
          id: "line-2",
          productId: "galletitas",
          productName: "Galletitas",
          saleUnit: "UNIT",
          soldQuantity: 4,
          returnedQuantity: 0,
          returnableQuantity: 4,
          chargedAmount: 4000,
          refundedAmount: 0,
          mustBeReturnedWhole: true,
        },
        {
          id: "line-3",
          productId: "queso",
          productName: "Queso por kilo",
          saleUnit: "KG",
          soldQuantity: 1250,
          returnedQuantity: 0,
          returnableQuantity: 1250,
          chargedAmount: 10_000,
          refundedAmount: 0,
          mustBeReturnedWhole: false,
        },
      ]);
    });

    it("subtracts what earlier returns took back", () => {
      const earlier = aSaleForReturn({
        returned: [{ saleLineId: "line-1", quantity: 2, refundedAmount: 5000 }],
      });

      const outcome = find({ sales: [earlier] }, BY_INVOICE);

      expect(outcome.kind === "found" && outcome.sale.lines[0]).toMatchObject({
        returnedQuantity: 2,
        returnableQuantity: 1,
        refundedAmount: 5000,
      });
    });

    it("shows what each line paid after the share of the sale's discount it was settled at", () => {
      const discounted = aSaleForReturn();
      discounted.sale.lines = settledLines({
        lines: discounted.sale.lines,
        saleDiscount: {
          kind: "AMOUNT",
          amount: 2150,
          reason: "cliente frecuente",
          authorizedBy: null,
        },
      });

      const outcome = find({ sales: [discounted] }, BY_INVOICE);

      expect(
        outcome.kind === "found" && outcome.sale.lines.map((line) => line.chargedAmount),
      ).toEqual([6750, 3600, 9000]);
    });
  });

  describe("the windows", () => {
    it("tells the last day of each window and that both are open", () => {
      const outcome = find({}, BY_INVOICE);

      expect(outcome.kind === "found" && outcome.sale.windows).toEqual({
        change_of_mind: { lastAllowedDay: "2026-09-27", open: true },
        defective: { lastAllowedDay: "2027-03-12", open: true },
      });
    });

    it("tells that the change of mind window is closed from the sixteenth day while a defect is still allowed", () => {
      const outcome = find(
        {},
        BY_INVOICE,
        new Date(argentinaInstant("2026-09-28", "09:00", FIXED_ARGENTINA_ZONE_RULES)),
      );

      expect(outcome.kind === "found" && outcome.sale.windows).toEqual({
        change_of_mind: { lastAllowedDay: "2026-09-27", open: false },
        defective: { lastAllowedDay: "2027-03-12", open: true },
      });
    });

    it("closes a window at the end of the last day on the calendar of the zone rules it is given", () => {
      const justAfterMidnightUtc = new Date("2026-09-28T02:00:00.000Z");

      const underArgentina = find({}, BY_INVOICE, justAfterMidnightUtc, fixedOffsetZoneRules(-180));
      const underUtc = find({}, BY_INVOICE, justAfterMidnightUtc, fixedOffsetZoneRules(0));

      expect(
        underArgentina.kind === "found" && underArgentina.sale.windows.change_of_mind.open,
      ).toBe(true);
      expect(underUtc.kind === "found" && underUtc.sale.windows.change_of_mind.open).toBe(false);
    });

    it("follows the days the branch allows for a change of mind", () => {
      const outcome = find({ goodConditionReturnDays: 30 }, BY_INVOICE);

      expect(outcome.kind === "found" && outcome.sale.windows.change_of_mind).toEqual({
        lastAllowedDay: "2026-10-12",
        open: true,
      });
    });
  });

  describe("the payments", () => {
    it("offers a cash payment with what it still has left to give back and explains the others", () => {
      const outcome = find(
        {
          sales: [
            aSaleForReturn({
              payments: [{ ...CASH_PAYMENT, refundedAmount: 3000 }, TRANSFER_PAYMENT],
            }),
          ],
        },
        BY_INVOICE,
      );

      expect(outcome.kind === "found" && outcome.sale.payments).toEqual([
        {
          paymentId: "pay-cash",
          method: "CASH",
          amount: 15_000,
          refundedAmount: 3000,
          remaining: 12_000,
          eligible: true,
          ineligibleReason: null,
        },
        {
          paymentId: "pay-transfer",
          method: "TRANSFER",
          amount: 6500,
          refundedAmount: 0,
          remaining: 6500,
          eligible: false,
          ineligibleReason: "not_cash",
        },
      ]);
    });
  });

  it("changes nothing in the register", () => {
    const ledger = new FakeReturnLedger({ sales: [aSaleForReturn()] });
    const before = structuredClone(ledger.state);

    findSaleForReturn(
      { zoneRules: new FakeZoneRulesSource(), reader: ledger, clock: new FixedClock(RETURNED_AT) },
      BY_INVOICE,
    );

    expect(ledger.state).toEqual(before);
    expect(ledger.transactions).toBe(0);
  });
});
