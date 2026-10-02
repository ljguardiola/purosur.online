import { isValidCashAmount } from "../model/cash-amount.js";
import type { OpenedCashSession } from "../model/cash-session.js";
import { registerOperationAccess } from "../model/register-operation.js";
import type { CashLedger, IdGenerator } from "./cash-ledger.js";
import type { OperationAuthority } from "./operation-authority.js";
import type { Clock } from "./register-store.js";

export interface OpenCashSessionInput {
  openingFloat: number;
}

export interface OpenCashSessionGrant {
  openerId: string;
}

export interface OpenCashSessionPorts<Grant extends OpenCashSessionGrant, Refusal> {
  ledger: CashLedger;
  clock: Clock;
  ids: IdGenerator;
  authority: OperationAuthority<Grant, Refusal>;
}

export type OpenCashSessionOutcome<Grant extends OpenCashSessionGrant> =
  | { kind: "invalid_opening_float" }
  | { kind: "not_permitted" }
  | { kind: "already_open" }
  | { kind: "unavailable" }
  | { kind: "opened"; session: OpenedCashSession; grant: Grant };

export async function openCashSession<Grant extends OpenCashSessionGrant, Refusal>(
  { ledger, clock, ids, authority }: OpenCashSessionPorts<Grant, Refusal>,
  { openingFloat }: OpenCashSessionInput,
): Promise<OpenCashSessionOutcome<Grant> | Refusal> {
  if (!isValidCashAmount(openingFloat)) {
    return { kind: "invalid_opening_float" };
  }
  const authorization = await authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  const { grant } = authorization;
  const { openerId } = grant;

  return ledger.transaction<OpenCashSessionOutcome<Grant>>((tx) => {
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
    return { kind: "opened", session, grant };
  });
}
