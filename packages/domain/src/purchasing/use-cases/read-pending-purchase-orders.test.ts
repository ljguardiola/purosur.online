import { describe, expect, it } from "vitest";
import {
  FakeZoneRulesSource,
  fixedOffsetZoneRules,
} from "../../shared/test-support/fake-zone-rules-source.js";
import { aPendingOrderRow } from "../model/test-support/pending-purchase-order-row.js";
import { readPendingPurchaseOrders } from "./read-pending-purchase-orders.js";
import { FakePendingPurchaseOrdersReader } from "./test-support/fake-pending-purchase-orders-reader.js";

const clock = { now: () => new Date("2026-10-06T15:00:00.000Z") };
const noRange = { from: undefined, to: undefined };

describe("readPendingPurchaseOrders", () => {
  it("reads the orders of the asked range for the branch and builds the report", async () => {
    const reader = new FakePendingPurchaseOrdersReader([
      aPendingOrderRow({ orderId: "a" }),
      aPendingOrderRow({ orderId: "b", supplierId: "supplier-2" }),
    ]);

    const report = await readPendingPurchaseOrders(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: { from: "2026-09-01", to: "2026-10-06" } },
    );

    expect(report.range).toEqual({ from: "2026-09-01", to: "2026-10-06" });
    expect(report.orders.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(report.totals).toMatchObject({ orders: 2, suppliers: 2 });
    expect(reader.reads).toEqual([
      { locationId: "branch-1", range: { from: "2026-09-01", to: "2026-10-06" } },
    ]);
  });

  it("asks for the last thirty days up to today in Argentina when no range is asked", async () => {
    const reader = new FakePendingPurchaseOrdersReader();

    const report = await readPendingPurchaseOrders(
      {
        zoneRules: new FakeZoneRulesSource(),
        reader,
        clock: { now: () => new Date("2026-10-07T01:30:00.000Z") },
      },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.range).toEqual({ from: "2026-09-07", to: "2026-10-06" });
    expect(reader.reads[0]?.range).toEqual({ from: "2026-09-07", to: "2026-10-06" });
  });

  it("asks for the last thirty days when only one bound is asked", async () => {
    const report = await readPendingPurchaseOrders(
      {
        zoneRules: new FakeZoneRulesSource(),
        reader: new FakePendingPurchaseOrdersReader(),
        clock,
      },
      { locationId: "branch-1", asked: { from: "2026-10-01", to: undefined } },
    );

    expect(report.range).toEqual({ from: "2026-09-07", to: "2026-10-06" });
  });

  it("counts the current day on the calendar of the zone rules it is given", async () => {
    const report = await readPendingPurchaseOrders(
      {
        reader: new FakePendingPurchaseOrdersReader(),
        clock: { now: () => new Date("2026-10-07T01:30:00.000Z") },
        zoneRules: new FakeZoneRulesSource(fixedOffsetZoneRules(0)),
      },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.range).toEqual({ from: "2026-09-08", to: "2026-10-07" });
  });

  it("reports no orders and zero totals when none is pending", async () => {
    const report = await readPendingPurchaseOrders(
      {
        zoneRules: new FakeZoneRulesSource(),
        reader: new FakePendingPurchaseOrdersReader(),
        clock,
      },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.orders).toEqual([]);
    expect(report.totals).toEqual({
      orders: 0,
      suppliers: 0,
      expectedTotalCents: 0,
      hasUnpricedLine: false,
    });
  });
});
