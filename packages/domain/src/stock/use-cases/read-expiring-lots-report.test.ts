import { describe, expect, it } from "vitest";
import type { ZoneRules } from "../../shared/index.js";
import {
  FakeZoneRulesSource,
  fixedOffsetZoneRules,
} from "../../shared/test-support/fake-zone-rules-source.js";
import type { ExpiringLotProduct, ExpiringLotRow } from "./expiring-lot-reader.js";
import { readExpiringLotsReport } from "./read-expiring-lots-report.js";
import {
  FakeBranchSettings,
  FakeExpiringLotReader,
} from "./test-support/fake-expiring-lot-reader.js";
import { FixedClock } from "./test-support/fake-stock-store.js";

const NOON = new Date("2026-10-13T15:00:00.000Z");

const CHEESE: ExpiringLotProduct = {
  id: "product-cheese",
  name: "Queso cremoso",
  categoryId: "category-dairy",
  categoryName: "Lácteos",
  saleUnit: "KG",
};

function lot(
  id: string,
  overrides: Partial<ExpiringLotRow & { locationId: string }> = {},
): ExpiringLotRow & { locationId: string } {
  return {
    id,
    locationId: "location-1",
    lotNumber: null,
    expiresOn: "2026-10-20",
    technical: false,
    remaining: 4_000,
    cost: { totalCents: 5_000, quantity: 1_000 },
    costIncomplete: false,
    product: CHEESE,
    ...overrides,
  };
}

async function read(
  rows: (ExpiringLotRow & { locationId: string })[],
  options: {
    windowDays?: number;
    now?: Date;
    asked?: { from?: string; to?: string };
    rules?: ZoneRules;
  } = {},
) {
  const expiringLots = new FakeExpiringLotReader(rows);
  const branchSettings = new FakeBranchSettings(options.windowDays ?? 30);
  const report = await readExpiringLotsReport(
    {
      expiringLots,
      branchSettings,
      clock: new FixedClock(options.now ?? NOON),
      zoneRules: new FakeZoneRulesSource(options.rules),
    },
    { locationId: "location-1", asked: options.asked ?? {} },
  );
  return { report, expiringLots, branchSettings };
}

describe("readExpiringLotsReport", () => {
  it("answers the branch's warning window and, when no period is asked, the period from today to the window's end", async () => {
    const { report, branchSettings } = await read([], { windowDays: 45 });

    expect(report).toEqual({
      period: { from: "2026-10-13", to: "2026-11-27" },
      windowDays: 45,
      lots: [],
      summary: { lotCount: 0, valueCents: 0, withoutCostCount: 0 },
    });
    expect(branchSettings.reads).toEqual(["location-1"]);
  });

  it("takes today as the Argentine calendar day", async () => {
    const { report } = await read([], { windowDays: 0, now: new Date("2026-10-14T01:00:00.000Z") });

    expect(report.period).toEqual({ from: "2026-10-13", to: "2026-10-13" });
  });

  it("takes today on the calendar of the zone rules it is given", async () => {
    const { report } = await read([], {
      windowDays: 0,
      now: new Date("2026-10-14T01:00:00.000Z"),
      rules: fixedOffsetZoneRules(0),
    });

    expect(report.period).toEqual({ from: "2026-10-14", to: "2026-10-14" });
  });

  it("lists the lots within the window and leaves out those beyond it", async () => {
    const { report } = await read(
      [
        lot("inside", { expiresOn: "2026-11-12" }),
        lot("outside", { expiresOn: "2026-11-13" }),
        lot("today", { expiresOn: "2026-10-13" }),
      ],
      { windowDays: 30 },
    );

    expect(report.lots.map((listed) => listed.id)).toEqual(["today", "inside"]);
  });

  it("leaves out the lots already expired when no period is asked", async () => {
    const { report } = await read([
      lot("expired", { expiresOn: "2026-10-12" }),
      lot("current", { expiresOn: "2026-10-13" }),
    ]);

    expect(report.lots.map((listed) => listed.id)).toEqual(["current"]);
  });

  it("asks the lots expiring by the last day of the period", async () => {
    const { expiringLots } = await read([], { asked: { from: "2026-12-01", to: "2026-12-31" } });

    expect(expiringLots.lotReads).toEqual([{ locationId: "location-1", lastDay: "2026-12-31" }]);
  });

  it("lists the lots expiring in an asked period beyond the warning window", async () => {
    const { report } = await read(
      [
        lot("before", { expiresOn: "2026-11-30" }),
        lot("first-day", { expiresOn: "2026-12-01" }),
        lot("last-day", { expiresOn: "2026-12-31" }),
        lot("after", { expiresOn: "2027-01-01" }),
      ],
      { windowDays: 30, asked: { from: "2026-12-01", to: "2026-12-31" } },
    );

    expect(report.period).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(report.windowDays).toBe(30);
    expect(report.lots.map((listed) => listed.id)).toEqual(["first-day", "last-day"]);
  });

  it("lists the lots already expired that still hold stock when the asked period is in the past", async () => {
    const { report } = await read(
      [
        lot("expired-in-period", { expiresOn: "2026-09-15", remaining: 2_000 }),
        lot("expired-before", { expiresOn: "2026-08-31" }),
        lot("sold-out", { expiresOn: "2026-09-10", remaining: 0 }),
        lot("current", { expiresOn: "2026-10-20" }),
      ],
      { asked: { from: "2026-09-01", to: "2026-09-30" } },
    );

    expect(report.lots).toEqual([
      expect.objectContaining({
        id: "expired-in-period",
        expired: true,
        daysToExpiry: -28,
        remaining: 2_000,
      }),
    ]);
  });

  it("uses the window when only one bound is asked", async () => {
    const { report } = await read([lot("inside")], { asked: { from: "2026-12-01" } });

    expect(report.period).toEqual({ from: "2026-10-13", to: "2026-11-12" });
    expect(report.lots.map((listed) => listed.id)).toEqual(["inside"]);
  });

  it("summarizes how many lots are listed, their value and how many have no known value", async () => {
    const { report } = await read([
      lot("valued-1", { remaining: 4_000 }),
      lot("valued-2", { remaining: 1_000 }),
      lot("no-cost", { cost: null, costIncomplete: true }),
      lot("outside", { expiresOn: "2027-01-01" }),
      lot("technical", { technical: true, remaining: 9_000 }),
    ]);

    expect(report.summary).toEqual({ lotCount: 3, valueCents: 25_000, withoutCostCount: 1 });
  });
});
