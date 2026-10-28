import { describe, expect, it } from "vitest";
import { cashMovementsSummary, type ReportedCashMovement } from "./cash-movements-report.js";

function aMovement(overrides: Partial<ReportedCashMovement> = {}): ReportedCashMovement {
  return {
    id: "movement-1",
    occurredAt: new Date("2026-10-06T15:00:00.000Z"),
    kind: "CASH_IN",
    reason: "Cambio para la caja",
    amount: 1_000,
    sessionId: "session-1",
    registerName: "Caja 1",
    sessionOpenedAt: new Date("2026-10-06T11:00:00.000Z"),
    ...overrides,
  };
}

describe("cashMovementsSummary", () => {
  it("reports zero totals of every kind for no movements", () => {
    expect(cashMovementsSummary([])).toEqual({
      movements: [],
      totals: {
        CASH_IN: { movements: 0, amount: 0 },
        CASH_OUT: { movements: 0, amount: 0 },
        WITHDRAWAL: { movements: 0, amount: 0 },
      },
    });
  });

  it("totals the count and the amount of each kind", () => {
    const { totals } = cashMovementsSummary([
      aMovement({ id: "a", kind: "CASH_IN", amount: 1_000 }),
      aMovement({ id: "b", kind: "CASH_IN", amount: 250 }),
      aMovement({ id: "c", kind: "CASH_OUT", amount: 400 }),
      aMovement({ id: "d", kind: "WITHDRAWAL", amount: 5_000 }),
      aMovement({ id: "e", kind: "WITHDRAWAL", amount: 7_000 }),
      aMovement({ id: "f", kind: "WITHDRAWAL", amount: 1 }),
    ]);

    expect(totals).toEqual({
      CASH_IN: { movements: 2, amount: 1_250 },
      CASH_OUT: { movements: 1, amount: 400 },
      WITHDRAWAL: { movements: 3, amount: 12_001 },
    });
  });

  it("orders the movements latest first and breaks ties by id", () => {
    const earlier = aMovement({ id: "z", occurredAt: new Date("2026-10-06T10:00:00.000Z") });
    const later = aMovement({ id: "m", occurredAt: new Date("2026-10-06T20:00:00.000Z") });
    const tieB = aMovement({ id: "b", occurredAt: new Date("2026-10-06T15:00:00.000Z") });
    const tieA = aMovement({ id: "a", occurredAt: new Date("2026-10-06T15:00:00.000Z") });

    const { movements } = cashMovementsSummary([earlier, tieB, later, tieA]);

    expect(movements.map(({ id }) => id)).toEqual(["m", "a", "b", "z"]);
  });

  it("does not change the movements it is given", () => {
    const movements = [
      aMovement({ id: "a", occurredAt: new Date("2026-10-06T10:00:00.000Z") }),
      aMovement({ id: "b", occurredAt: new Date("2026-10-06T20:00:00.000Z") }),
    ];

    cashMovementsSummary(movements);

    expect(movements.map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("keeps every field of each movement", () => {
    const movement = aMovement({ kind: "WITHDRAWAL", reason: "Retiro a caja fuerte" });

    expect(cashMovementsSummary([movement]).movements).toEqual([movement]);
  });
});
