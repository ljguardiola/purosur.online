import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { MarginSaleLine } from "../model/margin-report.js";
import { readMarginReport } from "./read-margin-report.js";
import { FakeSaleMarginReportReader } from "./test-support/fake-sale-margin-report-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };

function soldLine(overrides: Partial<MarginSaleLine> = {}): MarginSaleLine {
  return {
    saleId: "sale-1",
    id: "p1",
    path: ["Azúcar 1 kg"],
    brandName: null,
    netContent: null,
    amount: 9_000,
    allocations: [
      {
        lotId: "lot-1",
        movementKind: "sale",
        quantity: -1_000,
        technical: false,
        costIncomplete: false,
        cost: { totalCents: 5_000, quantity: 1_000 },
      },
    ],
    ...overrides,
  };
}

describe("readMarginReport", () => {
  it("folds the products sold in the asked range into their margin, with the range answered", async () => {
    const reader = new FakeSaleMarginReportReader({ products: [soldLine()] });

    const report = await readMarginReport(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
        group: "product",
      },
    );

    expect(report).toEqual({
      range: { from: "2026-10-01", to: "2026-10-06" },
      group: "product",
      rows: [
        {
          id: "p1",
          path: ["Azúcar 1 kg"],
          brandName: null,
          netContent: null,
          amount: 9_000,
          cost: 5_000,
          margin: 4_000,
          incompleteSales: 0,
        },
      ],
      totals: { amount: 9_000, cost: 5_000, margin: 4_000, incompleteSales: 0 },
    });
    expect(reader.productReads).toEqual([
      {
        locationId: "branch-1",
        range: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    ]);
    expect(reader.categoryReads).toEqual([]);
  });

  it("reads the categories when the report is grouped by category", async () => {
    const reader = new FakeSaleMarginReportReader({
      products: [soldLine({ amount: 1 })],
      categories: [soldLine({ id: "c1", path: ["Almacén", "Dulces"], amount: 700 })],
    });

    const report = await readMarginReport(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined, group: "category" },
    );

    expect(report.group).toBe("category");
    expect(report.rows.map((row) => [row.id, row.path, row.amount])).toEqual([
      ["c1", ["Almacén", "Dulces"], 700],
    ]);
    expect(reader.productReads).toEqual([]);
    expect(reader.categoryReads).toHaveLength(1);
  });

  it("asks for the current Argentine day when no range is asked", async () => {
    const reader = new FakeSaleMarginReportReader();

    const report = await readMarginReport(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined, group: "product" },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(reader.productReads[0]?.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("limits the read to the asked register", async () => {
    const reader = new FakeSaleMarginReportReader();

    await readMarginReport(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: "register-2", group: "category" },
    );

    expect(reader.categoryReads[0]?.registerId).toBe("register-2");
  });

  it("reports no rows and zero totals for a range without sales", async () => {
    const report = await readMarginReport(
      { zoneRules: new FakeZoneRulesSource(), reader: new FakeSaleMarginReportReader(), clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined, group: "product" },
    );

    expect(report.rows).toEqual([]);
    expect(report.totals).toEqual({ amount: 0, cost: 0, margin: 0, incompleteSales: 0 });
  });
});
