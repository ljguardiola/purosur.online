import { CLOSED_FISCAL_TASK_STATE, type FiscalTaskState } from "@purosur/domain";
import type {
  CloseFiscalTaskStore,
  CloseFiscalTaskStoreTransaction,
  FiscalTaskClosingAudit,
  FiscalTaskClosingRecord,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, fiscalTasks, registers } from "../platform/db/schema.js";

class DrizzleFiscalTaskClosingTransaction<TQueryResult extends PgQueryResultHKT>
  implements CloseFiscalTaskStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
  }

  async lockFiscalTaskOfBranch(
    taskId: string,
    locationId: string,
  ): Promise<FiscalTaskState | null> {
    const [task] = await this.tx
      .select({ state: fiscalTasks.state })
      .from(fiscalTasks)
      .innerJoin(registers, eq(registers.id, fiscalTasks.registerId))
      .where(and(eq(fiscalTasks.id, taskId), eq(registers.locationId, locationId)))
      .for("update", { of: fiscalTasks });
    return task ? (task.state as FiscalTaskState) : null;
  }

  async recordClosing({
    taskId,
    closedBy,
    closedAt,
    note,
  }: FiscalTaskClosingRecord): Promise<void> {
    await this.tx
      .update(fiscalTasks)
      .set({ state: CLOSED_FISCAL_TASK_STATE, closedAt, closedBy, closingNote: note })
      .where(eq(fiscalTasks.id, taskId));
  }

  async recordClosingAudit({ taskId, actorId, at, note }: FiscalTaskClosingAudit): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "fiscal_task",
      entityId: taskId,
      actorId,
      previousValue: { state: "open" },
      newValue: { state: CLOSED_FISCAL_TASK_STATE, note },
      at,
    });
  }
}

export class DrizzleFiscalTaskClosingStore<TQueryResult extends PgQueryResultHKT>
  implements CloseFiscalTaskStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: CloseFiscalTaskStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleFiscalTaskClosingTransaction(tx)));
  }
}
