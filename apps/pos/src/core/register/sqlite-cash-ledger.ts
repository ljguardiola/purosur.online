import type { CashMovement, CashSession } from "@purosur/domain";
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

export function readOpenSession(database: LocalDatabase): CashSession | undefined {
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
      registerIdentity: () => this.registerIdentity(),
      recordOpenedSession: (session) => this.recordOpenedSession(session),
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

  private recordOpenedSession(session: CashSession): void {
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
