import { describe, expect, it } from "vitest";
import {
  FakeZoneRulesSource,
  fixedOffsetZoneRules,
} from "../../shared/test-support/fake-zone-rules-source.js";
import { aReceiptLineRow } from "../model/test-support/receipt-line-row.js";
import { readReceiptDifferences } from "./read-receipt-differences.js";
import { FakeReceiptDifferencesReader } from "./test-support/fake-receipt-differences-reader.js";

const clock = { now: () => new Date("2026-10-06T15:00:00.000Z") };
const noRange = { from: undefined, to: undefined };

describe("readReceiptDifferences", () => {
  it("reads the receipt lines of the asked range for the branch and builds the report", async () => {
    const reader = new FakeReceiptDifferencesReader([
      aReceiptLineRow({ receiptId: "a", missingQuantity: 1_000 }),
      aReceiptLineRow({ receiptId: "b", supplierId: "supplier-2", priceDifferenceCents: 90 }),
      aReceiptLineRow({ receiptId: "c" }),
    ]);

    const report = await readReceiptDifferences(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: { from: "2026-09-01", to: "2026-10-06" } },
    );

    expect(report.range).toEqual({ from: "2026-09-01", to: "2026-10-06" });
    expect(report.suppliers.map(({ supplierId }) => supplierId)).toEqual([
      "supplier-1",
      "supplier-2",
    ]);
    expect(report.totals).toMatchObject({ suppliers: 2, shortLines: 1, priceDifferenceLines: 1 });
    expect(reader.reads).toEqual([
      { locationId: "branch-1", range: { from: "2026-09-01", to: "2026-10-06" } },
    ]);
  });

  it("asks for the current day in Argentina when no range is asked", async () => {
    const reader = new FakeReceiptDifferencesReader();

    const report = await readReceiptDifferences(
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

  it("counts the current day on the calendar of the zone rules it is given", async () => {
    const report = await readReceiptDifferences(
      {
        reader: new FakeReceiptDifferencesReader(),
        clock: { now: () => new Date("2026-10-07T01:30:00.000Z") },
        zoneRules: new FakeZoneRulesSource(fixedOffsetZoneRules(0)),
      },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.range).toEqual({ from: "2026-10-07", to: "2026-10-07" });
  });

  it("reports no suppliers and zero totals when nothing was received", async () => {
    const report = await readReceiptDifferences(
      { zoneRules: new FakeZoneRulesSource(), reader: new FakeReceiptDifferencesReader(), clock },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.suppliers).toEqual([]);
    expect(report.totals).toEqual({
      suppliers: 0,
      shortLines: 0,
      priceDifferenceLines: 0,
      priceDifferenceCents: 0,
    });
  });
});
