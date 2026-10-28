import { describe, expect, it } from "vitest";
import {
  type SaleLinesGroup,
  weighedLinesByCashier,
  weighedLinesBySession,
  weighedLinesTotals,
} from "./hand-typed-weights-report.js";

const group = (
  overrides: Partial<SaleLinesGroup> & Pick<SaleLinesGroup, "weightSource" | "lines">,
): SaleLinesGroup => ({
  sessionId: "s1",
  registerName: "Caja 1",
  openedAt: new Date("2026-10-06T11:00:00.000Z"),
  cashierId: "u1",
  cashierName: "Ana",
  ...overrides,
});

describe("weighedLinesByCashier", () => {
  it("counts the weighed lines of a cashier and the ones typed by hand among them", () => {
    const rows = weighedLinesByCashier([
      group({ weightSource: "SCALE", lines: 5 }),
      group({ weightSource: "MANUAL", lines: 2 }),
    ]);

    expect(rows).toEqual([{ cashierId: "u1", name: "Ana", weighedLines: 7, typedLines: 2 }]);
  });

  it("adds the lines of a cashier across sessions", () => {
    const rows = weighedLinesByCashier([
      group({ sessionId: "s1", weightSource: "MANUAL", lines: 1 }),
      group({ sessionId: "s2", weightSource: "MANUAL", lines: 3 }),
      group({ sessionId: "s2", weightSource: "SCALE", lines: 4 }),
    ]);

    expect(rows).toEqual([{ cashierId: "u1", name: "Ana", weighedLines: 8, typedLines: 4 }]);
  });

  it("leaves out lines without a weight source and cashiers with no weighed line", () => {
    const rows = weighedLinesByCashier([
      group({ weightSource: null, lines: 9 }),
      group({ cashierId: "u2", cashierName: "Beto", weightSource: null, lines: 4 }),
      group({ cashierId: "u3", cashierName: "Carla", weightSource: "SCALE", lines: 1 }),
    ]);

    expect(rows).toEqual([{ cashierId: "u3", name: "Carla", weighedLines: 1, typedLines: 0 }]);
  });

  it("orders by typed lines, then weighed lines, most first", () => {
    const ids = weighedLinesByCashier([
      group({ cashierId: "u1", weightSource: "SCALE", lines: 9 }),
      group({ cashierId: "u2", weightSource: "MANUAL", lines: 2 }),
      group({ cashierId: "u3", weightSource: "MANUAL", lines: 1 }),
      group({ cashierId: "u3", weightSource: "SCALE", lines: 5 }),
      group({ cashierId: "u4", weightSource: "MANUAL", lines: 2 }),
      group({ cashierId: "u4", weightSource: "SCALE", lines: 1 }),
    ]).map((row) => row.cashierId);

    expect(ids).toEqual(["u4", "u2", "u3", "u1"]);
  });

  it("orders a tie by name comparing code units, unnamed last, then by id", () => {
    const tie = (cashierId: string, cashierName: string | null) =>
      group({ cashierId, cashierName, weightSource: "MANUAL", lines: 1 });
    const rows = [tie("u4", null), tie("u3", "Zoe"), tie("u2", "Ana"), tie("u1", "Ana")];

    const expected = ["u1", "u2", "u3", "u4"];
    expect(weighedLinesByCashier(rows).map((row) => row.cashierId)).toEqual(expected);
    expect(weighedLinesByCashier([...rows].reverse()).map((row) => row.cashierId)).toEqual(
      expected,
    );
  });
});

describe("weighedLinesBySession", () => {
  it("counts the lines of every cashier who sold in the session", () => {
    const rows = weighedLinesBySession([
      group({ cashierId: "u1", weightSource: "MANUAL", lines: 2 }),
      group({ cashierId: "u2", cashierName: "Beto", weightSource: "SCALE", lines: 3 }),
    ]);

    expect(rows).toEqual([
      {
        sessionId: "s1",
        registerName: "Caja 1",
        openedAt: new Date("2026-10-06T11:00:00.000Z"),
        weighedLines: 5,
        typedLines: 2,
      },
    ]);
  });

  it("leaves out sessions with no weighed line", () => {
    const rows = weighedLinesBySession([
      group({ sessionId: "s1", weightSource: null, lines: 4 }),
      group({ sessionId: "s2", weightSource: "SCALE", lines: 1 }),
    ]);

    expect(rows.map((row) => row.sessionId)).toEqual(["s2"]);
  });

  it("orders by typed lines, then weighed lines, then the latest opening, then id", () => {
    const at = (day: string) => new Date(`2026-10-${day}T11:00:00.000Z`);
    const session = (
      sessionId: string,
      openedAt: Date,
      weightSource: "SCALE" | "MANUAL",
      lines: number,
    ) => group({ sessionId, openedAt, weightSource, lines });
    const groups = [
      session("s1", at("01"), "SCALE", 9),
      session("s2", at("01"), "MANUAL", 1),
      session("s3", at("02"), "MANUAL", 1),
      session("s4", at("02"), "MANUAL", 1),
      session("s5", at("02"), "MANUAL", 1),
      session("s6", at("03"), "MANUAL", 1),
      session("s7", at("01"), "MANUAL", 1),
      session("s7", at("01"), "SCALE", 1),
    ];

    const expected = ["s7", "s6", "s3", "s4", "s5", "s2", "s1"];
    expect(weighedLinesBySession(groups).map((row) => row.sessionId)).toEqual(expected);
    expect(weighedLinesBySession([...groups].reverse()).map((row) => row.sessionId)).toEqual(
      expected,
    );
  });
});

describe("weighedLinesTotals", () => {
  it("adds the weighed lines and the ones typed by hand", () => {
    expect(
      weighedLinesTotals([
        group({ cashierId: "u1", weightSource: "SCALE", lines: 5 }),
        group({ cashierId: "u2", weightSource: "MANUAL", lines: 2 }),
        group({ cashierId: "u2", weightSource: null, lines: 8 }),
      ]),
    ).toEqual({
      weighedLines: 7,
      typedLines: 2,
      mostTyped: { cashierId: "u2", name: "Ana", typedLines: 2 },
    });
  });

  it("names the cashier who typed the most lines by hand, more weighed lines breaking a tie", () => {
    const totals = weighedLinesTotals([
      group({ cashierId: "u1", cashierName: "Ana", weightSource: "SCALE", lines: 9 }),
      group({ cashierId: "u2", cashierName: "Beto", weightSource: "MANUAL", lines: 2 }),
      group({ cashierId: "u3", cashierName: "Carla", weightSource: "MANUAL", lines: 2 }),
      group({ cashierId: "u3", cashierName: "Carla", weightSource: "SCALE", lines: 1 }),
    ]);

    expect(totals.mostTyped).toEqual({ cashierId: "u3", name: "Carla", typedLines: 2 });
  });

  it("names nobody when no weighed line was typed by hand", () => {
    const totals = weighedLinesTotals([group({ weightSource: "SCALE", lines: 4 })]);

    expect(totals).toEqual({ weighedLines: 4, typedLines: 0, mostTyped: null });
  });

  it("is zero without groups", () => {
    expect(weighedLinesTotals([])).toEqual({ weighedLines: 0, typedLines: 0, mostTyped: null });
  });
});
