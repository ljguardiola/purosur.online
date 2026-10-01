import {
  CASH_MOVEMENT_REASON_MAX_LENGTH,
  type CashMovementKind,
  cashMovementReason,
  isValidCashMovementAmount,
} from "../model/cash-movement-kind.js";
import type { CashMovement } from "../model/cash-session.js";
import { expectedCash } from "../model/expected-cash.js";
import type { CashLedger, IdGenerator } from "./cash-ledger.js";
import type { Clock } from "./register-store.js";

export interface RecordCashMovementInput {
  kind: CashMovementKind;
  amount: number;
  reason: string;
  actorId: string;
  authorizedBy: string | undefined;
}

export interface RecordCashMovementPorts {
  ledger: CashLedger;
  clock: Clock;
  ids: IdGenerator;
}

export type RecordCashMovementOutcome =
  | { kind: "invalid_amount" }
  | { kind: "invalid_reason"; maxLength: number }
  | { kind: "no_open_session" }
  | { kind: "exceeds_expected_cash"; expected: number }
  | { kind: "recorded"; movement: CashMovement };

export function recordCashMovement(
  { ledger, clock, ids }: RecordCashMovementPorts,
  input: RecordCashMovementInput,
): RecordCashMovementOutcome {
  if (!isValidCashMovementAmount(input.amount)) {
    return { kind: "invalid_amount" };
  }
  const reason = cashMovementReason(input.reason);
  if (reason === undefined) {
    return { kind: "invalid_reason", maxLength: CASH_MOVEMENT_REASON_MAX_LENGTH };
  }

  return ledger.transaction<RecordCashMovementOutcome>((tx) => {
    const session = tx.openSession();
    if (!session) {
      return { kind: "no_open_session" };
    }
    if (input.kind !== "CASH_IN") {
      const expected = expectedCash(tx.sessionMovements(session.id));
      if (input.amount > expected) {
        return { kind: "exceeds_expected_cash", expected };
      }
    }

    const occurredAt = clock.now();
    const movement: CashMovement = {
      id: ids.next(),
      sessionId: session.id,
      type: input.kind,
      amount: input.amount,
      reason,
      actorId: input.actorId,
      occurredAt,
      ...(input.authorizedBy === undefined ? {} : { authorizedBy: input.authorizedBy }),
    };
    tx.recordCashMovement(movement);
    const occurredAtIso = occurredAt.toISOString();
    tx.appendOutboxEvent({
      event_id: ids.next(),
      aggregate_type: "CashSession",
      aggregate_id: session.id,
      event_type: "cash_movement_recorded",
      schema_version: 1,
      payload: {
        type: input.kind,
        amount: input.amount,
        reason,
        ref_type: null,
        ref_id: null,
        actor_id: input.actorId,
        authorized_by: input.authorizedBy ?? null,
        occurred_at: occurredAtIso,
      },
      occurred_at: occurredAtIso,
      actor_id: input.actorId,
    });
    return { kind: "recorded", movement };
  });
}
