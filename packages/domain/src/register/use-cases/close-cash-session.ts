import { openSaleSummary } from "../../sales/index.js";
import { isValidCashAmount } from "../model/cash-amount.js";
import { cashCountDifference } from "../model/cash-count.js";
import type { ClosedCashSession } from "../model/cash-session.js";
import { expectedCash } from "../model/expected-cash.js";
import type { CashLedger, IdGenerator } from "./cash-ledger.js";
import type { OperationAuthority } from "./operation-authority.js";
import type { Clock } from "./register-store.js";

export interface CloseCashSessionInput {
  sessionId: string;
  countedCash: number;
}

export interface CloseCashSessionGrant {
  closerId: string;
}

export interface CloseCashSessionPorts<Refusal> {
  ledger: CashLedger;
  clock: Clock;
  ids: IdGenerator;
  authority: OperationAuthority<CloseCashSessionGrant, Refusal>;
}

export type CloseCashSessionOutcome =
  | { kind: "invalid_counted_cash" }
  | { kind: "no_open_session" }
  | { kind: "open_sale"; total: number; cancellable: boolean }
  | { kind: "closed"; session: ClosedCashSession };

export async function closeCashSession<Refusal>(
  { ledger, clock, ids, authority }: CloseCashSessionPorts<Refusal>,
  { sessionId, countedCash }: CloseCashSessionInput,
): Promise<CloseCashSessionOutcome | Refusal> {
  if (!isValidCashAmount(countedCash)) {
    return { kind: "invalid_counted_cash" };
  }
  const authorization = await authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  const { closerId } = authorization.grant;

  return ledger.transaction<CloseCashSessionOutcome>((tx) => {
    const open = tx.openSession();
    if (!open || open.id !== sessionId) {
      return { kind: "no_open_session" };
    }
    const openSale = tx.openSale(sessionId);
    if (openSale) {
      return { kind: "open_sale", ...openSaleSummary(openSale) };
    }

    const closedAt = clock.now();
    const expected = expectedCash(tx.sessionMovements(sessionId));
    const closed: ClosedCashSession = {
      id: open.id,
      registerId: open.registerId,
      deviceId: open.deviceId,
      openedBy: open.openedBy,
      openedAt: open.openedAt,
      openingFloat: open.openingFloat,
      state: "CLOSED",
      closedBy: closerId,
      closedAt,
      expectedCash: expected,
      countedCash,
      difference: cashCountDifference(countedCash, expected),
    };
    tx.recordCashMovement({
      id: ids.next(),
      sessionId,
      type: "CLOSING",
      amount: countedCash,
      actorId: closerId,
      occurredAt: closedAt,
    });
    tx.recordClosedSession(closed);
    const closedAtIso = closedAt.toISOString();
    tx.appendOutboxEvent({
      event_id: ids.next(),
      aggregate_type: "CashSession",
      aggregate_id: sessionId,
      event_type: "cash_session_closed",
      schema_version: 1,
      payload: {
        closed_by: closerId,
        closed_at: closedAtIso,
        expected_cash: expected,
        counted_cash: countedCash,
        difference: closed.difference,
      },
      occurred_at: closedAtIso,
      actor_id: closerId,
    });
    return { kind: "closed", session: closed };
  });
}
