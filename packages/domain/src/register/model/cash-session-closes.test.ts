import { describe, expect, it } from "vitest";
import {
  type CashSessionClose,
  cashSessionClosesSummary,
  hasCashDifference,
} from "./cash-session-closes.js";

function aClose(overrides: Partial<CashSessionClose> = {}): CashSessionClose {
  return {
    id: "session-1",
    closedAt: new Date("2026-10-06T20:00:00.000Z"),
    registerId: "register-1",
    registerName: "Caja 1",
    cashierId: "cashier-1",
    cashierName: "Ana",
    closedById: "cashier-1",
    closedByName: "Ana",
    expectedCash: 10_000,
    countedCash: 10_000,
    difference: 0,
    ...overrides,
  };
}

describe("hasCashDifference", () => {
  it.each([
    [0, false],
    [1, true],
    [-1, true],
    [-42_000, true],
  ])("answers for a difference of %i cents", (difference, expected) => {
    expect(hasCashDifference(difference)).toBe(expected);
  });
});

describe("cashSessionClosesSummary", () => {
  it("reports empty totals for no closes", () => {
    expect(cashSessionClosesSummary([])).toEqual({
      closes: [],
      totals: { sessions: 0, netDifference: 0, withDifference: 0, cashiersWithDifference: [] },
    });
  });

  it("orders the closes latest first and breaks ties by session id", () => {
    const earlier = aClose({ id: "z", closedAt: new Date("2026-10-06T10:00:00.000Z") });
    const later = aClose({ id: "m", closedAt: new Date("2026-10-06T20:00:00.000Z") });
    const tieB = aClose({ id: "b", closedAt: new Date("2026-10-06T15:00:00.000Z") });
    const tieA = aClose({ id: "a", closedAt: new Date("2026-10-06T15:00:00.000Z") });

    const { closes } = cashSessionClosesSummary([earlier, tieB, later, tieA]);

    expect(closes.map(({ id }) => id)).toEqual(["m", "a", "b", "z"]);
  });

  it("does not change the closes it is given", () => {
    const closes = [
      aClose({ id: "a", closedAt: new Date("2026-10-06T10:00:00.000Z") }),
      aClose({ id: "b", closedAt: new Date("2026-10-06T20:00:00.000Z") }),
    ];

    cashSessionClosesSummary(closes);

    expect(closes.map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("marks each close with whether it has a difference", () => {
    const { closes } = cashSessionClosesSummary([
      aClose({ id: "a", difference: 0 }),
      aClose({ id: "b", difference: -500, closedAt: new Date("2026-10-06T19:00:00.000Z") }),
    ]);

    expect(closes.map(({ id, hasDifference }) => [id, hasDifference])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });

  it("sums the signed differences and counts the closes with a difference", () => {
    const { totals } = cashSessionClosesSummary([
      aClose({ id: "a", difference: -50_000 }),
      aClose({ id: "b", difference: 8_000 }),
      aClose({ id: "c", difference: 0 }),
    ]);

    expect(totals).toMatchObject({ sessions: 3, netDifference: -42_000, withDifference: 2 });
  });

  it("counts the closes with a difference per cashier who opened them, most first", () => {
    const { totals } = cashSessionClosesSummary([
      aClose({ id: "a", cashierId: "u1", cashierName: "Tomás Ruiz", difference: -100 }),
      aClose({ id: "b", cashierId: "u2", cashierName: "Lucía Pérez", difference: 100 }),
      aClose({ id: "c", cashierId: "u2", cashierName: "Lucía Pérez", difference: 300 }),
      aClose({ id: "d", cashierId: "u3", cashierName: "Ana", difference: 0 }),
    ]);

    expect(totals.cashiersWithDifference).toEqual([
      { cashierId: "u2", cashierName: "Lucía Pérez", sessions: 2 },
      { cashierId: "u1", cashierName: "Tomás Ruiz", sessions: 1 },
    ]);
  });

  it("orders cashiers with the same count by name, unnamed last, then by id", () => {
    const { totals } = cashSessionClosesSummary([
      aClose({ id: "a", cashierId: "u4", cashierName: null, difference: 1 }),
      aClose({ id: "b", cashierId: "u2", cashierName: "Beto", difference: 1 }),
      aClose({ id: "c", cashierId: "u1", cashierName: "Ana", difference: 1 }),
      aClose({ id: "d", cashierId: "u3", cashierName: null, difference: 1 }),
    ]);

    expect(totals.cashiersWithDifference.map(({ cashierId }) => cashierId)).toEqual([
      "u1",
      "u2",
      "u3",
      "u4",
    ]);
  });

  it("counts a cashier whose closes were all exact as absent", () => {
    const { totals } = cashSessionClosesSummary([aClose({ difference: 0 })]);

    expect(totals.cashiersWithDifference).toEqual([]);
  });
});
