import {
  ARGENTINA_TIME_ZONE,
  CASH_MOVEMENT_KINDS,
  CASH_MOVEMENT_REASON_MAX_LENGTH,
  MAX_CASH_AMOUNT_CENTS,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { cashMovementsSchema } from "./cash-movements.js";

const MOVEMENT_ID = "2c7e9a14-5b3d-4f08-9e61-8a1d4c6b0f35";
const SESSION_ID = "6f1c2b7e-0a4d-4c55-8d21-3b9e5a7c1d02";

const movement = {
  id: MOVEMENT_ID,
  occurred_at: "2026-10-06T15:00:00.000Z",
  kind: "CASH_OUT",
  reason: "Compra de hielo",
  amount: 800,
  session_id: SESSION_ID,
  register_name: "Caja 1",
  session_opened_at: "2026-10-06T11:00:00.000Z",
};

const totals = {
  cash_in: { movements: 0, amount: 0 },
  cash_out: { movements: 1, amount: 800 },
  withdrawal: { movements: 0, amount: 0 },
};

const report = {
  range: { from: "2026-10-05", to: "2026-10-06" },
  totals,
  movements: [movement],
};

describe("cashMovementsSchema", () => {
  it("accepts the movements of a range with their totals", () => {
    expect(cashMovementsSchema.parse(report)).toEqual(report);
  });

  it("accepts a range without movements", () => {
    const empty = {
      ...report,
      totals: {
        cash_in: { movements: 0, amount: 0 },
        cash_out: { movements: 0, amount: 0 },
        withdrawal: { movements: 0, amount: 0 },
      },
      movements: [],
    };

    expect(cashMovementsSchema.parse(empty)).toEqual(empty);
  });

  it.each(CASH_MOVEMENT_KINDS)("accepts a movement of kind %s", (kind) => {
    const body = { ...report, movements: [{ ...movement, kind }] };

    expect(cashMovementsSchema.parse(body)).toEqual(body);
  });

  it("accepts the largest cash movement with the longest reason", () => {
    const body = {
      ...report,
      movements: [
        {
          ...movement,
          reason: "a".repeat(CASH_MOVEMENT_REASON_MAX_LENGTH),
          amount: MAX_CASH_AMOUNT_CENTS,
        },
      ],
    };

    expect(cashMovementsSchema.parse(body)).toEqual(body);
  });

  it("declares the zone the instants are shown in", () => {
    const { shape } = cashMovementsSchema.shape.movements.element;

    expect(shape.occurred_at.meta()).toEqual({ timeZone: ARGENTINA_TIME_ZONE });
    expect(shape.session_opened_at.meta()).toEqual({ timeZone: ARGENTINA_TIME_ZONE });
  });

  const withTotals = (change: object) => ({ totals: { ...totals, ...change } });
  const withMovement = (change: object) => ({ movements: [{ ...movement, ...change }] });

  it.each([
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
    [
      "a total without cash ins",
      { totals: { cash_out: totals.cash_out, withdrawal: totals.withdrawal } },
    ],
    [
      "a total without cash outs",
      { totals: { cash_in: totals.cash_in, withdrawal: totals.withdrawal } },
    ],
    [
      "a total without withdrawals",
      { totals: { cash_in: totals.cash_in, cash_out: totals.cash_out } },
    ],
    ["a negative count of cash ins", withTotals({ cash_in: { movements: -1, amount: 0 } })],
    ["a count of cash outs with decimals", withTotals({ cash_out: { movements: 1.5, amount: 0 } })],
    ["a negative amount of withdrawals", withTotals({ withdrawal: { movements: 0, amount: -1 } })],
    ["an amount of cash ins with decimals", withTotals({ cash_in: { movements: 0, amount: 1.5 } })],
    ["a movement that is not a record id", withMovement({ id: "mov-1" })],
    ["a movement at something that is not an instant", withMovement({ occurred_at: "ayer" })],
    ["a movement of a kind that is not reported", withMovement({ kind: "SALE" })],
    ["a movement without a reason", withMovement({ reason: undefined })],
    ["a movement with an empty reason", withMovement({ reason: "" })],
    ["a movement with a blank reason", withMovement({ reason: "   " })],
    ["a movement with an untrimmed reason", withMovement({ reason: " Compra de hielo " })],
    [
      "a movement with a reason too long",
      withMovement({ reason: "a".repeat(CASH_MOVEMENT_REASON_MAX_LENGTH + 1) }),
    ],
    ["a movement of zero", withMovement({ amount: 0 })],
    ["a negative movement", withMovement({ amount: -1 })],
    ["a movement with decimals", withMovement({ amount: 1.5 })],
    ["a movement above a cash amount", withMovement({ amount: MAX_CASH_AMOUNT_CENTS + 1 })],
    ["a session that is not a record id", withMovement({ session_id: "sesion-1" })],
    ["a movement without a register name", withMovement({ register_name: undefined })],
    [
      "a session opened at something that is not an instant",
      withMovement({ session_opened_at: "ayer" }),
    ],
  ])("refuses %s", (_name, change) => {
    expect(cashMovementsSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});
