import type { OperationAuthority } from "../../shared/index.js";
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
}

export interface RecordCashMovementGrant {
  actorId: string;
  authorizedBy: string | undefined;
}

export interface RecordCashMovementPorts<Grant extends RecordCashMovementGrant, Refusal> {
  ledger: CashLedger;
  clock: Clock;
  ids: IdGenerator;
  authority: OperationAuthority<Grant, Refusal>;
}

export type RecordCashMovementOutcome<Grant extends RecordCashMovementGrant> =
  | { kind: "invalid_amount" }
  | { kind: "invalid_reason"; maxLength: number }
  | { kind: "no_open_session" }
  | { kind: "exceeds_expected_cash"; expected: number }
  | { kind: "recorded"; movement: CashMovement; grant: Grant };

export async function recordCashMovement<Grant extends RecordCashMovementGrant, Refusal>(
  { ledger, clock, ids, authority }: RecordCashMovementPorts<Grant, Refusal>,
  input: RecordCashMovementInput,
): Promise<RecordCashMovementOutcome<Grant> | Refusal> {
  if (!isValidCashMovementAmount(input.amount)) {
    return { kind: "invalid_amount" };
  }
  const authorization = await authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  const { grant } = authorization;
  const { actorId, authorizedBy } = grant;
  const reason = cashMovementReason(input.reason);
  if (reason === undefined) {
    return { kind: "invalid_reason", maxLength: CASH_MOVEMENT_REASON_MAX_LENGTH };
  }

  return ledger.transaction<RecordCashMovementOutcome<Grant>>((tx) => {
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
      actorId,
      occurredAt,
      ...(authorizedBy === undefined ? {} : { authorizedBy }),
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
        actor_id: actorId,
        authorized_by: authorizedBy ?? null,
        occurred_at: occurredAtIso,
      },
      occurred_at: occurredAtIso,
      actor_id: actorId,
    });
    return { kind: "recorded", movement, grant };
  });
}
