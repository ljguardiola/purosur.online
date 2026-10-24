import type { Clock } from "../../shared/index.js";
import type { FiscalTaskState } from "../model/fiscal-task.js";

export interface FiscalTaskClosingRecord {
  taskId: string;
  closedBy: string;
  closedAt: Date;
  note: string;
}

export interface FiscalTaskClosingAudit {
  taskId: string;
  actorId: string;
  at: Date;
  note: string;
}

export interface CloseFiscalTaskStoreTransaction {
  lockFiscalTaskOfBranch(taskId: string, locationId: string): Promise<FiscalTaskState | null>;
  recordClosing(record: FiscalTaskClosingRecord): Promise<void>;
  recordClosingAudit(audit: FiscalTaskClosingAudit): Promise<void>;
}

export interface CloseFiscalTaskStore {
  transaction<TOutcome>(
    work: (tx: CloseFiscalTaskStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface CloseFiscalTaskPorts {
  store: CloseFiscalTaskStore;
  clock: Clock;
}
