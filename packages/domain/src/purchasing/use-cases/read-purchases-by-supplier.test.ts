import { describe, expect, it } from "vitest";
import {
  FakeZoneRulesSource,
  fixedOffsetZoneRules,
} from "../../shared/test-support/fake-zone-rules-source.js";
import type { PurchasedLine } from "../model/purchases-by-supplier-report.js";
import { readPurchasesBySupplier } from "./read-purchases-by-supplier.js";
import { FakePurchasesReportReader } from "./test-support/fake-purchases-report-reader.js";

const clock = { now: () => new Date("2026-10-06T15:00:00.000Z") };
const noRange = { from: undefined, to: undefined };

function aLine(overrides: Partial<PurchasedLine> = {}): PurchasedLine {
  return {
    purchaseId: "purchase-1",
    supplierId: "supplier-1",
    supplierName: "Distribuidora Norte",
    purchasedOn: "2026-10-06",
    costPaidCents: 1_000,
    quantity: 1_000,
    quantityPerPackage: 1_000,
    ...overrides,
  };
}

describe("readPurchasesBySupplier", () => {
  it("reads the purchases of the asked range for the branch and groups them", async () => {
    const reader = new FakePurchasesReportReader([
      aLine({ purchaseId: "a", purchasedOn: "2026-09-30" }),
      aLine({ purchaseId: "b", costPaidCents: 500 }),
    ]);

    const report = await readPurchasesBySupplier(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: { from: "2026-09-01", to: "2026-10-06" } },
    );

    expect(report.range).toEqual({ from: "2026-09-01", to: "2026-10-06" });
    expect(report.suppliers[0]?.months).toEqual([
      { month: "2026-09", purchases: 1, amount: 1_000 },
      { month: "2026-10", purchases: 1, amount: 500 },
    ]);
    expect(report.totals).toEqual({ suppliers: 1, purchases: 2, amount: 1_500 });
    expect(reader.reads).toEqual([
      { locationId: "branch-1", range: { from: "2026-09-01", to: "2026-10-06" } },
    ]);
  });

  it("asks for the current day in Argentina when no range is asked", async () => {
    const reader = new FakePurchasesReportReader();

    const report = await readPurchasesBySupplier(
      {
        zoneRules: new FakeZoneRulesSource(),
        reader,
        clock: { now: () => new Date("2026-10-07T01:30:00.000Z") },
      },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(reader.reads[0]?.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("asks for the current day on the calendar of the zone rules it is given", async () => {
    const report = await readPurchasesBySupplier(
      {
        reader: new FakePurchasesReportReader(),
        clock: { now: () => new Date("2026-10-07T01:30:00.000Z") },
        zoneRules: new FakeZoneRulesSource(fixedOffsetZoneRules(0)),
      },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.range).toEqual({ from: "2026-10-07", to: "2026-10-07" });
  });

  it("reports no suppliers and zero totals for a range without purchases", async () => {
    const report = await readPurchasesBySupplier(
      { zoneRules: new FakeZoneRulesSource(), reader: new FakePurchasesReportReader(), clock },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.suppliers).toEqual([]);
    expect(report.totals).toEqual({ suppliers: 0, purchases: 0, amount: 0 });
  });
});
