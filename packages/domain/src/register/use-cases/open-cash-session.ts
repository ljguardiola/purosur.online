import { isValidCashAmount } from "../model/cash-amount.js";
import type { OpenedCashSession } from "../model/cash-session.js";
import { registerOperationAccess } from "../model/register-operation.js";
import type { CashLedger, IdGenerator } from "./cash-ledger.js";
import type { Clock } from "./register-store.js";

export interface OpenCashSessionInput {
  openerId: string;
  openingFloat: number;
}

export interface OpenCashSessionPorts {
  ledger: CashLedger;
  clock: Clock;
  ids: IdGenerator;
}

export type OpenCashSessionOutcome =
  | { kind: "invalid_opening_float" }
  | { kind: "not_permitted" }
  | { kind: "already_open" }
  | { kind: "unavailable" }
  | { kind: "opened"; session: OpenedCashSession };

export function openCashSession(
  { ledger, clock, ids }: OpenCashSessionPorts,
  { openerId, openingFloat }: OpenCashSessionInput,
): OpenCashSessionOutcome {
  if (!isValidCashAmount(openingFloat)) {
    return { kind: "invalid_opening_float" };
  }

  return ledger.transaction<OpenCashSessionOutcome>((tx) => {
    const opener = { id: openerId, access: tx.openerAccess(openerId) };
    if (registerOperationAccess({ kind: "open_cash_session" }, opener).kind !== "permitted") {
      return { kind: "not_permitted" };
    }
    if (tx.openSession()) {
      return { kind: "already_open" };
    }
    const identity = tx.registerIdentity();
    if (!identity) {
      return { kind: "unavailable" };
    }

    const openedAt = clock.now();
    const session: OpenedCashSession = {
      id: ids.next(),
      registerId: identity.registerId,
      deviceId: identity.deviceId,
      openedBy: openerId,
      openedAt,
      openingFloat,
      state: "OPEN",
    };
    tx.recordOpenedSession(session);
    tx.recordCashMovement({
      id: ids.next(),
      sessionId: session.id,
      type: "OPENING",
      amount: openingFloat,
      actorId: openerId,
      occurredAt: openedAt,
    });
    const openedAtIso = openedAt.toISOString();
    tx.appendOutboxEvent({
      event_id: ids.next(),
      aggregate_type: "CashSession",
      aggregate_id: session.id,
      event_type: "cash_session_opened",
      schema_version: 1,
      payload: { opened_by: openerId, opened_at: openedAtIso, opening_float: openingFloat },
      occurred_at: openedAtIso,
      actor_id: openerId,
    });
    return { kind: "opened", session };
  });
}
