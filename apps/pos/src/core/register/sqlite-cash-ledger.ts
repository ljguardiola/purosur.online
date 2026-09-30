import type {
  CashMovement,
  CashMovementType,
  ClosedCashSession,
  OpenedCashSession,
} from "@purosur/domain";
import type {
  CashLedger,
  CashLedgerTransaction,
  RegisterIdentity,
} from "@purosur/domain/register/use-cases";
import type { SignInStore } from "../access/sqlite-sign-in-store";
import type { LocalDatabase } from "../platform/local-database";
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

export class SqliteCashLedger implements CashLedger {
  private readonly database: LocalDatabase;
  private readonly people: Pick<SignInStore, "activePerson">;
  private readonly outboxChainKey: string;

  constructor(
    database: LocalDatabase,
    people: Pick<SignInStore, "activePerson">,
    outboxChainKey: string,
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
      openSaleTotal: () => undefined,
      sessionMovements: (sessionId) => this.sessionMovements(sessionId),
      registerIdentity: () => this.registerIdentity(),
      recordOpenedSession: (session) => this.recordOpenedSession(session),
      recordClosedSession: (session) => this.recordClosedSession(session),
      recordCashMovement: (movement) => this.recordCashMovement(movement),
      appendOutboxEvent: (draft) => appendOutboxEvent(this.database, this.outboxChainKey, draft),
    };
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

  private sessionMovements(sessionId: string): CashMovement[] {
    return this.database
      .prepare<[string], MovementRow>(
        `SELECT id, session_id, type, amount, reason, ref_type, ref_id, actor_id, authorized_by, occurred_at
         FROM cash_movements WHERE session_id = ? ORDER BY rowid`,
      )
      .all(sessionId)
      .map(movementOf);
  }

  private recordCashMovement(movement: CashMovement): void {
    this.database
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
}
