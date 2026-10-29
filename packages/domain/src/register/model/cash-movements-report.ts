import { compareSpanishText } from "../../shared/index.js";
import type { CashMovementKind } from "./cash-movement-kind.js";

export interface ReportedCashMovement {
  id: string;
  occurredAt: Date;
  kind: CashMovementKind;
  reason: string;
  amount: number;
  sessionId: string;
  registerName: string;
  sessionOpenedAt: Date;
}

interface CashMovementsTotal {
  movements: number;
  amount: number;
}

export interface CashMovementsSummary {
  movements: ReportedCashMovement[];
  totals: Record<CashMovementKind, CashMovementsTotal>;
}

function movementOrder(a: ReportedCashMovement, b: ReportedCashMovement): number {
  return b.occurredAt.getTime() - a.occurredAt.getTime() || compareSpanishText(a.id, b.id);
}

function totalOfKind(
  movements: readonly ReportedCashMovement[],
  kind: CashMovementKind,
): CashMovementsTotal {
  const ofKind = movements.filter((movement) => movement.kind === kind);
  return {
    movements: ofKind.length,
    amount: ofKind.reduce((sum, movement) => sum + movement.amount, 0),
  };
}

export function cashMovementsSummary(
  movements: readonly ReportedCashMovement[],
): CashMovementsSummary {
  return {
    movements: [...movements].sort(movementOrder),
    totals: {
      CASH_IN: totalOfKind(movements, "CASH_IN"),
      CASH_OUT: totalOfKind(movements, "CASH_OUT"),
      WITHDRAWAL: totalOfKind(movements, "WITHDRAWAL"),
    },
  };
}
