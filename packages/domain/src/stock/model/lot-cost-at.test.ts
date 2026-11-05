import { describe, expect, it } from "vitest";
import { type LotCostChange, lotCostAt } from "./lot-cost-at.js";

const CURRENT = { totalCents: 9_000, quantity: 1_000 };
const ORIGINAL = { totalCents: 5_000, quantity: 1_000 };
const MIDDLE = { totalCents: 7_000, quantity: 1_000 };

function change(changedAt: string, previous = ORIGINAL): LotCostChange {
  return { changedAt: new Date(changedAt), previous };
}

describe("lotCostAt", () => {
  it("answers the current cost for a lot whose cost never changed", () => {
    expect(lotCostAt({ cost: CURRENT, costChanges: [] }, new Date("2026-03-01T12:00:00Z"))).toEqual(
      CURRENT,
    );
  });

  it("answers the cost before a change for an instant before it", () => {
    const lot = { cost: CURRENT, costChanges: [change("2026-03-10T12:00:00Z")] };

    expect(lotCostAt(lot, new Date("2026-03-10T11:59:59Z"))).toEqual(ORIGINAL);
  });

  it("answers the corrected cost from the instant of the change on", () => {
    const lot = { cost: CURRENT, costChanges: [change("2026-03-10T12:00:00Z")] };

    expect(lotCostAt(lot, new Date("2026-03-10T12:00:00Z"))).toEqual(CURRENT);
    expect(lotCostAt(lot, new Date("2026-03-11T12:00:00Z"))).toEqual(CURRENT);
  });

  it("answers the cost each of several changes left, whatever the order they are given in", () => {
    const lot = {
      cost: CURRENT,
      costChanges: [
        change("2026-03-12T12:00:00Z", MIDDLE),
        change("2026-03-10T12:00:00Z", ORIGINAL),
      ],
    };

    expect(lotCostAt(lot, new Date("2026-03-09T00:00:00Z"))).toEqual(ORIGINAL);
    expect(lotCostAt(lot, new Date("2026-03-11T00:00:00Z"))).toEqual(MIDDLE);
    expect(lotCostAt(lot, new Date("2026-03-13T00:00:00Z"))).toEqual(CURRENT);
  });

  it("answers no cost for a lot without one that never changed", () => {
    expect(lotCostAt({ cost: null, costChanges: [] }, new Date("2026-03-01T12:00:00Z"))).toBeNull();
  });
});
