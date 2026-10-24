import type { FiscalTaskState } from "../../model/fiscal-task.js";
import type {
  CloseFiscalTaskStore,
  CloseFiscalTaskStoreTransaction,
  FiscalTaskClosingAudit,
  FiscalTaskClosingRecord,
} from "../close-fiscal-task-ports.js";

type WriteOperation = "recordClosing" | "recordClosingAudit";

interface SeededTask {
  locationId: string;
  state: FiscalTaskState;
}

interface FakeCloseFiscalTaskState {
  tasks: Map<string, SeededTask>;
  closings: FiscalTaskClosingRecord[];
  audits: FiscalTaskClosingAudit[];
}

export const DEFAULT_LOCATION_ID = "location-1";

export class FakeCloseFiscalTaskStore implements CloseFiscalTaskStore {
  readonly operationOrder: string[] = [];
  readonly failingWrites = new Set<WriteOperation>();
  private state: FakeCloseFiscalTaskState = { tasks: new Map(), closings: [], audits: [] };

  seedTask(taskId: string, state: FiscalTaskState, locationId = DEFAULT_LOCATION_ID): void {
    this.state.tasks.set(taskId, { locationId, state });
  }

  stateOf(taskId: string): FiscalTaskState | undefined {
    return this.state.tasks.get(taskId)?.state;
  }

  snapshot(): { closings: FiscalTaskClosingRecord[]; audits: FiscalTaskClosingAudit[] } {
    return structuredClone({ closings: this.state.closings, audits: this.state.audits });
  }

  async transaction<TOutcome>(
    work: (tx: CloseFiscalTaskStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.state);
    try {
      return await work(this.transactionOver());
    } catch (error) {
      this.state = before;
      throw error;
    }
  }

  private transactionOver(): CloseFiscalTaskStoreTransaction {
    const order = this.operationOrder;
    const write = (operation: WriteOperation) => {
      order.push(operation);
      if (this.failingWrites.has(operation)) {
        throw new Error(`${operation} failed`);
      }
    };
    return {
      lockFiscalTaskOfBranch: async (taskId, locationId) => {
        order.push("lockFiscalTaskOfBranch");
        const task = this.state.tasks.get(taskId);
        return task && task.locationId === locationId ? task.state : null;
      },
      recordClosing: async (record) => {
        write("recordClosing");
        const task = this.state.tasks.get(record.taskId);
        if (task) {
          task.state = "closed";
        }
        this.state.closings.push(structuredClone(record));
      },
      recordClosingAudit: async (audit) => {
        write("recordClosingAudit");
        this.state.audits.push(structuredClone(audit));
      },
    };
  }
}
