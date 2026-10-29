import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { removedLinesAndCancelledSalesSchema } from "./removed-lines-and-cancelled-sales.js";

const removed = { lines: 3, units: 4, thousandths: 1_500, amount: 5_400 };
const cancelled = { sales: 2, units: 6, thousandths: 0, amount: 9_000 };

const report = {
  range: { from: "2026-10-05", to: "2026-10-06" },
  cashiers: [
    {
      cashier_id: "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77",
      name: "Ana",
      removed,
      cancelled,
    },
    {
      cashier_id: "9a3f6c52-1d84-4b07-8c1e-5e7a2b9d4f10",
      name: null,
      removed,
      cancelled,
    },
  ],
  sessions: [
    {
      session_id: "0b6f8d3a-2c41-4e9b-a7d5-3f1e9c8b6a20",
      register_name: "Caja 1",
      opened_at: "2026-10-06T11:00:00.000Z",
      removed,
      cancelled,
    },
  ],
  totals: { removed, cancelled },
};

describe("removedLinesAndCancelledSalesSchema", () => {
  it("accepts the cashiers and sessions of a range with their totals", () => {
    expect(removedLinesAndCancelledSalesSchema.parse(report)).toEqual(report);
  });

  it("accepts a range without removals or cancellations", () => {
    const empty = {
      ...report,
      cashiers: [],
      sessions: [],
      totals: {
        removed: { lines: 0, units: 0, thousandths: 0, amount: 0 },
        cancelled: { sales: 0, units: 0, thousandths: 0, amount: 0 },
      },
    };

    expect(removedLinesAndCancelledSalesSchema.parse(empty)).toEqual(empty);
  });

  it("declares the zone the opening of a session is shown in", () => {
    const sessionShape = removedLinesAndCancelledSalesSchema.shape.sessions.element;

    expect(sessionShape.shape.opened_at.meta()).toEqual({ timeZone: ARGENTINA_TIME_ZONE });
  });

  it.each([
    ["an empty cashier id", { cashiers: [{ ...report.cashiers[0], cashier_id: "" }] }],
    ["a missing cashier name", { cashiers: [{ ...report.cashiers[0], name: undefined }] }],
    [
      "a negative removed amount",
      { cashiers: [{ ...report.cashiers[0], removed: { ...removed, amount: -1 } }] },
    ],
    [
      "a removed line count with decimals",
      { cashiers: [{ ...report.cashiers[0], removed: { ...removed, lines: 1.5 } }] },
    ],
    [
      "a negative cancelled sale count",
      { cashiers: [{ ...report.cashiers[0], cancelled: { ...cancelled, sales: -1 } }] },
    ],
    [
      "a cancelled thousandths count with decimals",
      { cashiers: [{ ...report.cashiers[0], cancelled: { ...cancelled, thousandths: 0.5 } }] },
    ],
    [
      "a cashier without the removed lines",
      { cashiers: [{ ...report.cashiers[0], removed: undefined }] },
    ],
    [
      "a cashier without the cancelled sales",
      { cashiers: [{ ...report.cashiers[0], cancelled: undefined }] },
    ],
    ["an empty session id", { sessions: [{ ...report.sessions[0], session_id: "" }] }],
    ["an empty register name", { sessions: [{ ...report.sessions[0], register_name: "" }] }],
    [
      "an opening that is not a date and time",
      { sessions: [{ ...report.sessions[0], opened_at: "ayer" }] },
    ],
    [
      "a negative session removed units",
      { sessions: [{ ...report.sessions[0], removed: { ...removed, units: -1 } }] },
    ],
    [
      "a session cancelled amount that is not a number",
      { sessions: [{ ...report.sessions[0], cancelled: { ...cancelled, amount: "9" } }] },
    ],
    [
      "a session without the removed lines",
      { sessions: [{ ...report.sessions[0], removed: undefined }] },
    ],
    ["a missing cancelled total", { totals: { removed } }],
    ["a missing removed total", { totals: { cancelled } }],
    [
      "a negative removed total",
      { totals: { removed: { ...removed, thousandths: -1 }, cancelled } },
    ],
    [
      "a cancelled total with decimals",
      { totals: { removed, cancelled: { ...cancelled, sales: 1.5 } } },
    ],
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
  ])("refuses %s", (_name, change) => {
    expect(removedLinesAndCancelledSalesSchema.safeParse({ ...report, ...change }).success).toBe(
      false,
    );
  });
});
