import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { cashSessionClosesSchema } from "./cash-session-closes.js";

const REGISTER_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";
const CASHIER_ID = "9a3e7c40-2b1d-4f6a-8c05-5d7e1a3b9c28";
const SESSION_ID = "6f1c2b7e-0a4d-4c55-8d21-3b9e5a7c1d02";

const session = {
  id: SESSION_ID,
  closed_at: "2026-10-06T20:00:00.000Z",
  register_id: REGISTER_ID,
  register_name: "Caja 1",
  cashier_id: CASHIER_ID,
  cashier_name: "Ana",
  closed_by_id: CASHIER_ID,
  closed_by_name: "Ana",
  expected_cash: 10_000,
  counted_cash: 9_500,
  difference: -500,
  has_difference: true,
};

const cashier = { cashier_id: CASHIER_ID, cashier_name: "Ana", sessions: 1 };

const report = {
  range: { from: "2026-10-05", to: "2026-10-06" },
  totals: { sessions: 1, net_difference: -500, with_difference: 1, cashiers: [cashier] },
  sessions: [session],
};

describe("cashSessionClosesSchema", () => {
  it("accepts the closes of a range with their totals", () => {
    expect(cashSessionClosesSchema.parse(report)).toEqual(report);
  });

  it("declares the zone the close instant is shown in", () => {
    expect(cashSessionClosesSchema.shape.sessions.element.shape.closed_at.meta()).toEqual({
      timeZone: ARGENTINA_TIME_ZONE,
    });
  });

  it("accepts a range without closes", () => {
    const empty = {
      ...report,
      totals: { sessions: 0, net_difference: 0, with_difference: 0, cashiers: [] },
      sessions: [],
    };

    expect(cashSessionClosesSchema.parse(empty)).toEqual(empty);
  });

  it("accepts a surplus and an exact close", () => {
    const sessions = [
      { ...session, counted_cash: 10_300, difference: 300 },
      { ...session, counted_cash: 10_000, difference: 0, has_difference: false },
    ];

    expect(cashSessionClosesSchema.parse({ ...report, sessions }).sessions).toEqual(sessions);
  });

  it("accepts a net difference below zero", () => {
    const body = { ...report, totals: { ...report.totals, net_difference: -42_000 } };

    expect(cashSessionClosesSchema.parse(body)).toEqual(body);
  });

  it("accepts people whose names are unknown", () => {
    const unknown = {
      ...report,
      totals: { ...report.totals, cashiers: [{ ...cashier, cashier_name: null }] },
      sessions: [{ ...session, cashier_name: null, closed_by_name: null }],
    };

    expect(cashSessionClosesSchema.parse(unknown)).toEqual(unknown);
  });

  const withTotals = (change: object) => ({ totals: { ...report.totals, ...change } });
  const withSession = (change: object) => ({ sessions: [{ ...session, ...change }] });

  it.each([
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
    ["a negative session count", withTotals({ sessions: -1 })],
    ["a session count with decimals", withTotals({ sessions: 1.5 })],
    ["a net difference with decimals", withTotals({ net_difference: 1.5 })],
    ["a negative count of closes with a difference", withTotals({ with_difference: -1 })],
    ["a count of closes with a difference with decimals", withTotals({ with_difference: 1.5 })],
    ["a cashier without an id", withTotals({ cashiers: [{ cashier_name: "Ana", sessions: 1 }] })],
    ["a cashier with an empty id", withTotals({ cashiers: [{ ...cashier, cashier_id: "" }] })],
    [
      "a cashier without a name field",
      withTotals({ cashiers: [{ cashier_id: CASHIER_ID, sessions: 1 }] }),
    ],
    ["a cashier count of zero", withTotals({ cashiers: [{ ...cashier, sessions: 0 }] })],
    ["a cashier count with decimals", withTotals({ cashiers: [{ ...cashier, sessions: 1.5 }] })],
    ["a session that is not a record id", withSession({ id: "sesion-1" })],
    ["a register that is not a record id", withSession({ register_id: "caja-1" })],
    ["a close at something that is not an instant", withSession({ closed_at: "ayer" })],
    ["a session without a register name", withSession({ register_name: undefined })],
    ["a session with an empty cashier id", withSession({ cashier_id: "" })],
    ["a session without a cashier name field", withSession({ cashier_name: undefined })],
    ["a session with an empty closing person id", withSession({ closed_by_id: "" })],
    ["a session without a closing person name field", withSession({ closed_by_name: undefined })],
    ["negative expected cash", withSession({ expected_cash: -1 })],
    ["expected cash with decimals", withSession({ expected_cash: 1.5 })],
    ["negative counted cash", withSession({ counted_cash: -1 })],
    ["counted cash with decimals", withSession({ counted_cash: 1.5 })],
    ["a difference with decimals", withSession({ difference: 1.5 })],
    ["a session without the difference flag", withSession({ has_difference: undefined })],
  ])("refuses %s", (_name, change) => {
    expect(cashSessionClosesSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});
