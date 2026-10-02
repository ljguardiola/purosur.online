import type { ListedCashMovement } from "@purosur/contracts";
import type {
  CashMovement,
  CashMovementType,
  ClosedCashSession,
  OpenedCashSession,
  OutboxEventDraft,
} from "@purosur/domain";
import type {
  CashLedger,
  CashLedgerTransaction,
  OpenSale,
  RegisterIdentity,
} from "@purosur/domain/register/use-cases";
import type { SignInStore } from "../access/sqlite-sign-in-store";
import type { LocalDatabase } from "../platform/local-database";
import { readOpenSale } from "../sales/sqlite-open-sale";
import { readSalePayments } from "../sales/sqlite-sale-payments";
import { appendOutboxEvent } from "../sync/sqlite-outbox";

interface SessionRow {
  id: string;
  register_id: string;
  device_id: string;
  opened_by: string;
  opened_at: string;
  opening_float: number;
}

export function readOpenSession(database: LocalDatabase): OpenedCashSession | undefined {
  const row = database
    .prepare<[], SessionRow>(
      `SELECT id, register_id, device_id, opened_by, opened_at, opening_float
       FROM cash_sessions WHERE state = 'OPEN'`,
    )
    .get();
  return row === undefined
    ? undefined
    : {
        id: row.id,
        registerId: row.register_id,
        deviceId: row.device_id,
        openedBy: row.opened_by,
        openedAt: new Date(row.opened_at),
        openingFloat: row.opening_float,
        state: "OPEN",
      };
}

interface ListedMovementRow {
  id: string;
  type: CashMovementType;
  amount: number;
  reason: string | null;
  occurred_at: string;
  actor_id: string;
  actor_first_name: string;
  authorized_by: string | null;
  authorizer_first_name: string | null;
}

export function readOpenSessionMovements(
  database: LocalDatabase,
): ListedCashMovement[] | undefined {
  const session = readOpenSession(database);
  if (session === undefined) {
    return undefined;
  }
  return database
    .prepare<[string], ListedMovementRow>(
      `SELECT cash_movements.id AS id, cash_movements.type AS type,
              cash_movements.amount AS amount, cash_movements.reason AS reason,
              cash_movements.occurred_at AS occurred_at, cash_movements.actor_id AS actor_id,
              actor.first_name AS actor_first_name,
              cash_movements.authorized_by AS authorized_by,
              authorizer.first_name AS authorizer_first_name
       FROM cash_movements
       JOIN users AS actor ON actor.id = cash_movements.actor_id
       LEFT JOIN users AS authorizer ON authorizer.id = cash_movements.authorized_by
       WHERE cash_movements.session_id = ?
       ORDER BY cash_movements.occurred_at, cash_movements.rowid`,
    )
    .all(session.id)
    .map((row) => ({
      id: row.id,
      type: row.type,
      amount: row.amount,
      reason: row.reason,
      occurred_at: row.occurred_at,
      actor: { user_id: row.actor_id, first_name: row.actor_first_name },
      authorized_by:
        row.authorized_by === null || row.authorizer_first_name === null
          ? null
          : { user_id: row.authorized_by, first_name: row.authorizer_first_name },
    }));
}

interface MovementRow {
  id: string;
  session_id: string;
  type: CashMovementType;
  amount: number;
  reason: string | null;
  ref_type: string | null;
  ref_id: string | null;
  actor_id: string;
  authorized_by: string | null;
  occurred_at: string;
}

function movementOf(row: MovementRow): CashMovement {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    amount: row.amount,
    actorId: row.actor_id,
    occurredAt: new Date(row.occurred_at),
    ...(row.reason === null ? {} : { reason: row.reason }),
    ...(row.ref_type === null || row.ref_id === null
      ? {}
      : { ref: { type: row.ref_type, id: row.ref_id } }),
    ...(row.authorized_by === null ? {} : { authorizedBy: row.authorized_by }),
  };
}

export function readSessionMovements(database: LocalDatabase, sessionId: string): CashMovement[] {
  return database
    .prepare<[string], MovementRow>(
      `SELECT id, session_id, type, amount, reason, ref_type, ref_id, actor_id, authorized_by, occurred_at
       FROM cash_movements WHERE session_id = ? ORDER BY rowid`,
    )
    .all(sessionId)
    .map(movementOf);
}

export function insertCashMovement(database: LocalDatabase, movement: CashMovement): void {
  database
    .prepare(
      `INSERT INTO cash_movements (
         id, session_id, type, amount, reason, ref_type, ref_id, actor_id, authorized_by, occurred_at
       ) VALUES (
         @id, @session_id, @type, @amount, @reason, @ref_type, @ref_id, @actor_id, @authorized_by, @occurred_at
       )`,
    )
    .run({
      id: movement.id,
      session_id: movement.sessionId,
      type: movement.type,
      amount: movement.amount,
      reason: movement.reason ?? null,
      ref_type: movement.ref?.type ?? null,
      ref_id: movement.ref?.id ?? null,
      actor_id: movement.actorId,
      authorized_by: movement.authorizedBy ?? null,
      occurred_at: movement.occurredAt.toISOString(),
    });
}

export class SqliteCashLedger implements CashLedger {
  private readonly database: LocalDatabase;
  private readonly people: Pick<SignInStore, "activePerson">;
  private readonly outboxChainKey: string | undefined;

  constructor(
    database: LocalDatabase,
    people: Pick<SignInStore, "activePerson">,
    outboxChainKey: string | undefined,
  ) {
    this.database = database;
    this.people = people;
    this.outboxChainKey = outboxChainKey;
  }

  transaction<TOutcome>(work: (tx: CashLedgerTransaction) => TOutcome): TOutcome {
    return this.database.transaction(() => work(this.transactionScope()))();
  }

  private transactionScope(): CashLedgerTransaction {
    return {
      openerAccess: (userId) => this.people.activePerson(userId)?.access,
      openSession: () => readOpenSession(this.database),
      openSale: (sessionId) => this.openSale(sessionId),
      sessionMovements: (sessionId) => readSessionMovements(this.database, sessionId),
      registerIdentity: () => this.registerIdentity(),
      recordOpenedSession: (session) => this.recordOpenedSession(session),
      recordClosedSession: (session) => this.recordClosedSession(session),
      recordCashMovement: (movement) => insertCashMovement(this.database, movement),
      appendOutboxEvent: (draft) => this.appendOutboxEvent(draft),
    };
  }

  private openSale(sessionId: string): OpenSale | undefined {
    const sale = readOpenSale(this.database, sessionId);
    return sale && { lines: sale.lines, payments: readSalePayments(this.database, sale.id) };
  }

  private appendOutboxEvent(draft: OutboxEventDraft): void {
    if (this.outboxChainKey === undefined) {
      throw new Error("the ledger has no outbox chain key");
    }
    appendOutboxEvent(this.database, this.outboxChainKey, draft);
  }

  private registerIdentity(): RegisterIdentity | undefined {
    const row = this.database
      .prepare<[], { register_id: string; device_id: string }>(
        `SELECT own_register.id AS register_id, sync_state.device_id AS device_id
         FROM own_register, sync_state
         WHERE own_register.removed = 0 AND sync_state.device_id IS NOT NULL`,
      )
      .get();
    return row === undefined ? undefined : { registerId: row.register_id, deviceId: row.device_id };
  }

  private recordOpenedSession(session: OpenedCashSession): void {
    this.database
      .prepare(
        `INSERT INTO cash_sessions (
           id, register_id, device_id, opened_by, opened_at, opening_float, state
         ) VALUES (@id, @register_id, @device_id, @opened_by, @opened_at, @opening_float, @state)`,
      )
      .run({
        id: session.id,
        register_id: session.registerId,
        device_id: session.deviceId,
        opened_by: session.openedBy,
        opened_at: session.openedAt.toISOString(),
        opening_float: session.openingFloat,
        state: session.state,
      });
  }

  private recordClosedSession(session: ClosedCashSession): void {
    this.database
      .prepare(
        `UPDATE cash_sessions SET
           state = @state, closed_by = @closed_by, closed_at = @closed_at,
           expected_cash = @expected_cash, counted_cash = @counted_cash, difference = @difference
         WHERE id = @id`,
      )
      .run({
        id: session.id,
        state: session.state,
        closed_by: session.closedBy,
        closed_at: session.closedAt.toISOString(),
        expected_cash: session.expectedCash,
        counted_cash: session.countedCash,
        difference: session.difference,
      });
  }
}
