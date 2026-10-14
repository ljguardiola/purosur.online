import {
  PointTerminalAlreadyAssigned,
  type PointTerminalAssignment,
  type PointTerminalAssignmentRecord,
  type PointTerminalAssignmentStore,
  type PointTerminalAssignmentStoreTransaction,
} from "@purosur/domain/payments/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { lockBranchRegister } from "../fiscal/drizzle-point-of-sale-claims.js";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import { auditLog, registerPointTerminals } from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

const UNIQUE_VIOLATION = "23505";
const TERMINAL_KEY = "register_point_terminals_terminal_id_key";
const NEVER_ASSIGNED_VERSION = 0;

function assignmentAuditValueOf(assignment: PointTerminalAssignment) {
  return { terminal_id: assignment.terminalId, version: assignment.version };
}

class DrizzlePointTerminalAssignmentStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements PointTerminalAssignmentStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly now: () => Date;
  private readonly pending: PendingChanges;

  constructor(tx: PgDatabase<TQueryResult>, now: () => Date, pending: PendingChanges) {
    this.tx = tx;
    this.now = now;
    this.pending = pending;
  }

  lockBranchRegister(locationId: string, registerId: string) {
    return lockBranchRegister(this.tx, locationId, registerId);
  }

  async lockRegisterPointTerminal(registerId: string): Promise<PointTerminalAssignment> {
    const [current] = await this.tx
      .select({
        terminalId: registerPointTerminals.terminalId,
        version: registerPointTerminals.version,
      })
      .from(registerPointTerminals)
      .where(eq(registerPointTerminals.registerId, registerId))
      .for("update");
    return current ?? { terminalId: null, version: NEVER_ASSIGNED_VERSION };
  }

  async lockPointTerminalHolder(terminalId: string): Promise<string | undefined> {
    const [holder] = await this.tx
      .select({ registerId: registerPointTerminals.registerId })
      .from(registerPointTerminals)
      .where(eq(registerPointTerminals.terminalId, terminalId))
      .for("update");
    return holder?.registerId;
  }

  async recordPointTerminalAssignment(record: PointTerminalAssignmentRecord): Promise<void> {
    const { registerId, terminalId, version, actorId } = record;
    const [previous] = await this.tx
      .select({
        terminalId: registerPointTerminals.terminalId,
        version: registerPointTerminals.version,
      })
      .from(registerPointTerminals)
      .where(eq(registerPointTerminals.registerId, registerId));
    const fields = { terminalId, version };
    try {
      await this.tx
        .insert(registerPointTerminals)
        .values({ registerId, ...fields })
        .onConflictDoUpdate({ target: registerPointTerminals.registerId, set: fields });
    } catch (error) {
      if (
        postgresErrorChain(error).some(
          (link) => link.code === UNIQUE_VIOLATION && link.constraint === TERMINAL_KEY,
        )
      ) {
        throw new PointTerminalAlreadyAssigned();
      }
      throw error;
    }
    await this.tx.insert(auditLog).values({
      entity: "register_point_terminal",
      entityId: registerId,
      actorId,
      previousValue: previous ? assignmentAuditValueOf(previous) : null,
      newValue: assignmentAuditValueOf(fields),
      at: this.now(),
    });
    this.pending.note({
      entity: "register_point_terminal",
      entityId: registerId,
      version,
      op: previous ? "update" : "insert",
    });
  }
}

export class DrizzlePointTerminalAssignmentStore<TQueryResult extends PgQueryResultHKT>
  implements PointTerminalAssignmentStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: PointTerminalAssignmentStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzlePointTerminalAssignmentStoreTransaction(tx, this.now, pending)),
    );
  }
}
