import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { handTypedWeightsSchema } from "./hand-typed-weights.js";

const report = {
  range: { from: "2026-10-05", to: "2026-10-06" },
  cashiers: [
    {
      cashier_id: "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77",
      name: "Ana",
      weighed_lines: 7,
      typed_lines: 2,
    },
    {
      cashier_id: "9a3f6c52-1d84-4b07-8c1e-5e7a2b9d4f10",
      name: null,
      weighed_lines: 1,
      typed_lines: 0,
    },
  ],
  sessions: [
    {
      session_id: "0b6f8d3a-2c41-4e9b-a7d5-3f1e9c8b6a20",
      register_name: "Caja 1",
      opened_at: "2026-10-06T11:00:00.000Z",
      weighed_lines: 8,
      typed_lines: 2,
    },
  ],
  totals: {
    weighed_lines: 8,
    typed_lines: 2,
    most_typed: { cashier_id: "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77", name: "Ana", typed_lines: 2 },
  },
};

describe("handTypedWeightsSchema", () => {
  it("accepts the cashiers and sessions of a range with their totals", () => {
    expect(handTypedWeightsSchema.parse(report)).toEqual(report);
  });

  it("accepts a range without weighed lines", () => {
    const empty = {
      ...report,
      cashiers: [],
      sessions: [],
      totals: { weighed_lines: 0, typed_lines: 0, most_typed: null },
    };

    expect(handTypedWeightsSchema.parse(empty)).toEqual(empty);
  });

  it("accepts a cashier who typed the most without a name", () => {
    const unnamed = {
      ...report,
      totals: { ...report.totals, most_typed: { ...report.totals.most_typed, name: null } },
    };

    expect(handTypedWeightsSchema.parse(unnamed)).toEqual(unnamed);
  });

  it("declares the zone the opening of a session is shown in", () => {
    const sessionShape = handTypedWeightsSchema.shape.sessions.element;

    expect(sessionShape.shape.opened_at.meta()).toEqual({ timeZone: ARGENTINA_TIME_ZONE });
  });

  it.each([
    ["an empty cashier id", { cashiers: [{ ...report.cashiers[0], cashier_id: "" }] }],
    ["a missing cashier name", { cashiers: [{ ...report.cashiers[0], name: undefined }] }],
    ["a negative weighed count", { cashiers: [{ ...report.cashiers[0], weighed_lines: -1 }] }],
    ["a typed count with decimals", { cashiers: [{ ...report.cashiers[0], typed_lines: 1.5 }] }],
    ["an empty session id", { sessions: [{ ...report.sessions[0], session_id: "" }] }],
    ["an empty register name", { sessions: [{ ...report.sessions[0], register_name: "" }] }],
    [
      "an opening that is not a date and time",
      { sessions: [{ ...report.sessions[0], opened_at: "ayer" }] },
    ],
    ["a negative session typed count", { sessions: [{ ...report.sessions[0], typed_lines: -1 }] }],
    ["a total that is not a number", { totals: { ...report.totals, weighed_lines: "8" } }],
    ["a missing typed total", { totals: { weighed_lines: 8, most_typed: null } }],
    ["a missing cashier who typed the most", { totals: { weighed_lines: 8, typed_lines: 2 } }],
    [
      "an empty id of the cashier who typed the most",
      { totals: { ...report.totals, most_typed: { ...report.totals.most_typed, cashier_id: "" } } },
    ],
    [
      "a negative count of the cashier who typed the most",
      {
        totals: { ...report.totals, most_typed: { ...report.totals.most_typed, typed_lines: -1 } },
      },
    ],
    [
      "a count with decimals of the cashier who typed the most",
      {
        totals: { ...report.totals, most_typed: { ...report.totals.most_typed, typed_lines: 1.5 } },
      },
    ],
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
  ])("refuses %s", (_name, change) => {
    expect(handTypedWeightsSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});
