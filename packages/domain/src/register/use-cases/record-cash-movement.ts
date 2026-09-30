import { isValidCashAmount } from "../model/cash-amount.js";
import { type CashMovementKind, cashMovementReason } from "../model/cash-movement-kind.js";
import type { CashMovement } from "../model/cash-session.js";
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
  | { kind: "invalid_reason" }
  | { kind: "no_open_session" }
  | { kind: "recorded"; movement: CashMovement };

export function recordCashMovement(
  { ledger, clock, ids }: RecordCashMovementPorts,
  input: RecordCashMovementInput,
): RecordCashMovementOutcome {
  if (!isValidCashAmount(input.amount) || input.amount === 0) {
    return { kind: "invalid_amount" };
  }
  const reason = cashMovementReason(input.reason);
  if (reason === undefined) {
    return { kind: "invalid_reason" };
  }

  return ledger.transaction<RecordCashMovementOutcome>((tx) => {
    const session = tx.openSession();
    if (!session) {
      return { kind: "no_open_session" };
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
