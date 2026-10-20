import { describe, expect, it } from "vitest";
import { readSalesByPromotion } from "./read-sales-by-promotion.js";
import { FakePromotionSalesReportReader } from "./test-support/fake-promotion-sales-report-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };

const terms = {
  benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
  target: { kind: "PRODUCT", name: "Yerba" },
  weekdays: [],
} as const;

const discounted = [
  {
    promotionId: "p1",
    name: "Tres por dos",
    terms,
    weightSource: null,
    quantity: 6,
    lines: 2,
    discounted: 2_000,
  },
  {
    promotionId: "p2",
    name: null,
    terms: null,
    weightSource: "SCALE",
    quantity: 1_500,
    lines: 3,
    discounted: 9_000,
  },
] as const;

describe("readSalesByPromotion", () => {
  it("orders the promotions that discounted in the asked range and totals them", async () => {
    const reader = new FakePromotionSalesReportReader([...discounted]);

    const report = await readSalesByPromotion(
      { reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    );

    expect(report).toEqual({
      range: { from: "2026-10-01", to: "2026-10-06" },
      rows: [
        {
          promotionId: "p2",
          name: null,
          terms: null,
          lines: 3,
          units: 0,
          thousandths: 1_500,
          discounted: 9_000,
        },
        {
          promotionId: "p1",
          name: "Tres por dos",
          terms,
          lines: 2,
          units: 6,
          thousandths: 0,
          discounted: 2_000,
        },
      ],
      totals: {
        discounted: 11_000,
        lines: 5,
        mostUsed: { promotionId: "p2", name: null, lines: 3 },
      },
    });
    expect(reader.reads).toEqual([
      {
        locationId: "branch-1",
        range: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    ]);
  });

  it("asks for the current day of the clock when no range is asked", async () => {
    const reader = new FakePromotionSalesReportReader();

    const report = await readSalesByPromotion(
      { reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(reader.reads[0]?.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("limits the read to the asked register", async () => {
    const reader = new FakePromotionSalesReportReader();

    await readSalesByPromotion(
      { reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: "register-2" },
    );

    expect(reader.reads[0]?.registerId).toBe("register-2");
  });

  it("reports no rows and zero totals for a range without discounts", async () => {
    const report = await readSalesByPromotion(
      { reader: new FakePromotionSalesReportReader(), clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.rows).toEqual([]);
    expect(report.totals).toEqual({ discounted: 0, lines: 0, mostUsed: null });
  });
});
