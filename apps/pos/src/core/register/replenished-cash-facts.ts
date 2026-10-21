import type { CashMovement, ClosedCashSession } from "@purosur/domain";
import type { IdGenerator } from "@purosur/domain/register/use-cases";
import type { ReplenishedEventSource, SyncedFact } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import {
  insertCashMovement,
  insertOpenedSession,
  markSessionClosed,
  readRegisterIdentity,
} from "./sqlite-cash-ledger";

type CashFact = Extract<
  SyncedFact,
  { kind: "cash_session_opened" | "cash_session_closed" | "cash_movement_recorded" }
>;

interface HeldSession {
  register_id: string;
  device_id: string;
  opened_by: string;
  opened_at: string;
  opening_float: number;
  state: "OPEN" | "CLOSED";
}

function heldSession(database: LocalDatabase, sessionId: string): HeldSession | undefined {
  return database
    .prepare<[string], HeldSession>(
      `SELECT register_id, device_id, opened_by, opened_at, opening_float, state
       FROM cash_sessions WHERE id = ?`,
    )
    .get(sessionId);
}

function openSession(
  database: LocalDatabase,
  { session }: Extract<CashFact, { kind: "cash_session_opened" }>,
  source: ReplenishedEventSource,
  ids: IdGenerator,
): void {
  if (heldSession(database, session.id) !== undefined) {
    return;
  }
  const identity = readRegisterIdentity(database);
  if (identity === undefined) {
    throw new Error("the register has no identity");
  }
  insertOpenedSession(database, {
    id: session.id,
    registerId: identity.registerId,
    deviceId: source.deviceId,
    openedBy: session.openedBy,
    openedAt: session.openedAt,
    openingFloat: session.openingFloat,
    state: "OPEN",
  });
  insertCashMovement(database, {
    id: ids.next(),
    sessionId: session.id,
    type: "OPENING",
    amount: session.openingFloat,
    actorId: session.openedBy,
    occurredAt: session.openedAt,
  });
}

function closeSession(
  database: LocalDatabase,
  { session }: Extract<CashFact, { kind: "cash_session_closed" }>,
  ids: IdGenerator,
): void {
  const held = heldSession(database, session.id);
  if (held === undefined) {
    throw new Error(`cash session ${session.id} is not held`);
  }
  if (held.state === "CLOSED") {
    return;
  }
  insertCashMovement(database, {
    id: ids.next(),
    sessionId: session.id,
    type: "CLOSING",
    amount: session.countedCash,
    actorId: session.closedBy,
    occurredAt: session.closedAt,
  });
  const closed: ClosedCashSession = {
    id: session.id,
    registerId: held.register_id,
    deviceId: held.device_id,
    openedBy: held.opened_by,
    openedAt: new Date(held.opened_at),
    openingFloat: held.opening_float,
    state: "CLOSED",
    closedBy: session.closedBy,
    closedAt: session.closedAt,
    expectedCash: session.expectedCash,
    countedCash: session.countedCash,
    difference: session.difference,
  };
  markSessionClosed(database, closed);
}

function movementHeld(database: LocalDatabase, movement: Omit<CashMovement, "id">): boolean {
  return (
    database
      .prepare(
        `SELECT 1 FROM cash_movements
         WHERE session_id = @session_id AND type = @type AND amount = @amount
           AND actor_id = @actor_id AND occurred_at = @occurred_at
           AND reason IS @reason AND ref_type IS @ref_type AND ref_id IS @ref_id
           AND authorized_by IS @authorized_by`,
      )
      .get({
        session_id: movement.sessionId,
        type: movement.type,
        amount: movement.amount,
        actor_id: movement.actorId,
        occurred_at: movement.occurredAt.toISOString(),
        reason: movement.reason ?? null,
        ref_type: movement.ref?.type ?? null,
        ref_id: movement.ref?.id ?? null,
        authorized_by: movement.authorizedBy ?? null,
      }) !== undefined
  );
}

function recordMovement(
  database: LocalDatabase,
  { movement }: Extract<CashFact, { kind: "cash_movement_recorded" }>,
  ids: IdGenerator,
): void {
  const recorded: Omit<CashMovement, "id"> = {
    sessionId: movement.sessionId,
    type: movement.type,
    amount: movement.amount,
    reason: movement.reason,
    actorId: movement.actorId,
    occurredAt: movement.occurredAt,
    ...(movement.refType === null || movement.refId === null
      ? {}
      : { ref: { type: movement.refType, id: movement.refId } }),
    ...(movement.authorizedBy === null ? {} : { authorizedBy: movement.authorizedBy }),
  };
  if (movementHeld(database, recorded)) {
    return;
  }
  insertCashMovement(database, { id: ids.next(), ...recorded });
}

export function applyReplenishedCashFact(
  database: LocalDatabase,
  fact: CashFact,
  source: ReplenishedEventSource,
  ids: IdGenerator,
): void {
  switch (fact.kind) {
    case "cash_session_opened":
      openSession(database, fact, source, ids);
      break;
    case "cash_session_closed":
      closeSession(database, fact, ids);
      break;
    case "cash_movement_recorded":
      recordMovement(database, fact, ids);
      break;
  }
}
