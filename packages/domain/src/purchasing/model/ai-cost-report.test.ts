import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { AI_COST_GROUPINGS, aiCostByPeriod, aiCostOf } from "./ai-cost-report.js";
import { anAiCall } from "./test-support/recorded-ai-call.js";

const ZERO = { costNanoUsd: 0, unpricedCalls: 0 };

describe("AI_COST_GROUPINGS", () => {
  it("groups by day, supplier or person", () => {
    expect(AI_COST_GROUPINGS).toEqual(["day", "supplier", "person"]);
  });
});

describe("aiCostOf", () => {
  it("is zero for no calls", () => {
    expect(aiCostOf([])).toEqual({ reading: ZERO, proposals: ZERO, total: ZERO });
  });

  it("sums the cost of the reading calls and of the proposal calls apart, and both together", () => {
    const cost = aiCostOf([
      { purpose: "READING", costNanoUsd: 1_000 },
      { purpose: "READING", costNanoUsd: 250 },
      { purpose: "LINK_PROPOSAL", costNanoUsd: 40 },
    ]);

    expect(cost).toEqual({
      reading: { costNanoUsd: 1_250, unpricedCalls: 0 },
      proposals: { costNanoUsd: 40, unpricedCalls: 0 },
      total: { costNanoUsd: 1_290, unpricedCalls: 0 },
    });
  });

  it("counts a call without a price as unpriced, adding nothing to the cost", () => {
    const cost = aiCostOf([
      { purpose: "READING", costNanoUsd: null },
      { purpose: "LINK_PROPOSAL", costNanoUsd: 40 },
      { purpose: "LINK_PROPOSAL", costNanoUsd: null },
      { purpose: "LINK_PROPOSAL", costNanoUsd: null },
    ]);

    expect(cost).toEqual({
      reading: { costNanoUsd: 0, unpricedCalls: 1 },
      proposals: { costNanoUsd: 40, unpricedCalls: 2 },
      total: { costNanoUsd: 40, unpricedCalls: 3 },
    });
  });

  it("makes the total the sum of the reading and the proposals for any calls", () => {
    const call = fc.record({
      purpose: fc.constantFrom("READING" as const, "LINK_PROPOSAL" as const),
      costNanoUsd: fc.option(fc.integer({ min: 0, max: 1_000_000_000 }), { nil: null }),
    });

    fc.assert(
      fc.property(fc.array(call), (calls) => {
        const { reading, proposals, total } = aiCostOf(calls);

        expect(total.costNanoUsd).toBe(reading.costNanoUsd + proposals.costNanoUsd);
        expect(total.unpricedCalls).toBe(reading.unpricedCalls + proposals.unpricedCalls);
      }),
    );
  });
});

describe("aiCostByPeriod", () => {
  it("reports no groups and a zero total for no calls", () => {
    for (const groupBy of AI_COST_GROUPINGS) {
      expect(aiCostByPeriod([], groupBy)).toEqual({
        groups: [],
        total: { reading: ZERO, proposals: ZERO, total: ZERO },
      });
    }
  });

  it("groups by the day each call happened on, from the earliest", () => {
    const report = aiCostByPeriod(
      [
        anAiCall({ occurredOn: "2026-10-07", costNanoUsd: 100 }),
        anAiCall({ occurredOn: "2026-10-05", costNanoUsd: 10 }),
        anAiCall({ occurredOn: "2026-10-07", purpose: "LINK_PROPOSAL", costNanoUsd: 1 }),
      ],
      "day",
    );

    expect(report.groups).toEqual([
      {
        key: "2026-10-05",
        name: null,
        reading: { costNanoUsd: 10, unpricedCalls: 0 },
        proposals: ZERO,
        total: { costNanoUsd: 10, unpricedCalls: 0 },
      },
      {
        key: "2026-10-07",
        name: null,
        reading: { costNanoUsd: 100, unpricedCalls: 0 },
        proposals: { costNanoUsd: 1, unpricedCalls: 0 },
        total: { costNanoUsd: 101, unpricedCalls: 0 },
      },
    ]);
    expect(report.total).toEqual({
      reading: { costNanoUsd: 110, unpricedCalls: 0 },
      proposals: { costNanoUsd: 1, unpricedCalls: 0 },
      total: { costNanoUsd: 111, unpricedCalls: 0 },
    });
  });

  it("groups by supplier with its name, the costliest first", () => {
    const report = aiCostByPeriod(
      [
        anAiCall({ supplierId: "s-1", supplierName: "Alfa", costNanoUsd: 5 }),
        anAiCall({ supplierId: "s-2", supplierName: "Beta", costNanoUsd: 500 }),
        anAiCall({ supplierId: "s-1", supplierName: "Alfa", costNanoUsd: 20 }),
      ],
      "supplier",
    );

    expect(report.groups.map(({ key, name, total }) => [key, name, total.costNanoUsd])).toEqual([
      ["s-2", "Beta", 500],
      ["s-1", "Alfa", 25],
    ]);
  });

  it("groups by person with the name, the costliest first", () => {
    const report = aiCostByPeriod(
      [
        anAiCall({ personId: "p-1", personName: "Ana", costNanoUsd: 5 }),
        anAiCall({ personId: "p-2", personName: "Beto", costNanoUsd: 500 }),
        anAiCall({ personId: "p-1", personName: "Ana", costNanoUsd: 20 }),
      ],
      "person",
    );

    expect(report.groups.map(({ key, name, total }) => [key, name, total.costNanoUsd])).toEqual([
      ["p-2", "Beto", 500],
      ["p-1", "Ana", 25],
    ]);
  });

  it("orders groups of the same cost by name and then by id", () => {
    const report = aiCostByPeriod(
      [
        anAiCall({ supplierId: "s-3", supplierName: "Zeta", costNanoUsd: 7 }),
        anAiCall({ supplierId: "s-2", supplierName: "Álamo", costNanoUsd: 7 }),
        anAiCall({ supplierId: "s-1", supplierName: "Álamo", costNanoUsd: 7 }),
      ],
      "supplier",
    );

    expect(report.groups.map(({ key }) => key)).toEqual(["s-1", "s-2", "s-3"]);
  });

  it("keeps a group of calls without a price, counting them as unpriced", () => {
    const report = aiCostByPeriod(
      [anAiCall({ costNanoUsd: null }), anAiCall({ costNanoUsd: 30 })],
      "supplier",
    );

    expect(report.groups[0]?.total).toEqual({ costNanoUsd: 30, unpricedCalls: 1 });
    expect(report.total.total).toEqual({ costNanoUsd: 30, unpricedCalls: 1 });
  });

  it("does not change the calls it is given", () => {
    const calls = [anAiCall({ occurredOn: "2026-10-07" }), anAiCall({ occurredOn: "2026-10-05" })];

    aiCostByPeriod(calls, "day");

    expect(calls.map(({ occurredOn }) => occurredOn)).toEqual(["2026-10-07", "2026-10-05"]);
  });

  it("adds up the groups to the total whichever way they are grouped", () => {
    const call = fc.record({
      purpose: fc.constantFrom("READING" as const, "LINK_PROPOSAL" as const),
      occurredOn: fc.constantFrom("2026-10-05", "2026-10-06", "2026-10-07"),
      supplierId: fc.constantFrom("s-1", "s-2", "s-3"),
      personId: fc.constantFrom("p-1", "p-2"),
      costNanoUsd: fc.option(fc.integer({ min: 0, max: 1_000_000_000 }), { nil: null }),
    });

    fc.assert(
      fc.property(fc.array(call), fc.constantFrom(...AI_COST_GROUPINGS), (calls, groupBy) => {
        const report = aiCostByPeriod(
          calls.map((entry) =>
            anAiCall({
              ...entry,
              supplierName: entry.supplierId,
              personName: entry.personId,
            }),
          ),
          groupBy,
        );

        expect(report.groups.reduce((sum, group) => sum + group.total.costNanoUsd, 0)).toBe(
          report.total.total.costNanoUsd,
        );
        expect(report.groups.reduce((sum, group) => sum + group.total.unpricedCalls, 0)).toBe(
          report.total.total.unpricedCalls,
        );
      }),
    );
  });
});
