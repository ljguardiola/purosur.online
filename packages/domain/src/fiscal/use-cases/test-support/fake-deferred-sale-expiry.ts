import type { DeferredSaleRegularizationTask } from "../../model/deferred-sale-record.js";
import type {
  DeferredSaleCandidate,
  DeferredSaleExpiryStore,
  DeferredSaleExpiryTransaction,
} from "../regularize-expired-deferred-sales-ports.js";

interface ExpiryState {
  pending: DeferredSaleCandidate[];
  tasks: DeferredSaleRegularizationTask[];
}

export class FakeDeferredSaleExpiryStore implements DeferredSaleExpiryStore {
  readonly readSaleIds: string[] = [];
  transactions = 0;
  failOnRecordingFor: string | null = null;
  private state: ExpiryState;

  constructor(pending: readonly DeferredSaleCandidate[]) {
    this.state = { pending: structuredClone([...pending]), tasks: [] };
  }

  get pendingIds(): string[] {
    return this.state.pending.map((sale) => sale.id);
  }

  get tasks(): DeferredSaleRegularizationTask[] {
    return structuredClone(this.state.tasks);
  }

  async transaction<TOutcome>(
    work: (transaction: DeferredSaleExpiryTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactions += 1;
    const staged = structuredClone(this.state);
    const outcome = await work({
      lockPendingDeferredSales: async () => {
        this.readSaleIds.push(...staged.pending.map((sale) => sale.id));
        return structuredClone(staged.pending);
      },
      recordExpiry: async (deferredSaleId, task) => {
        if (this.failOnRecordingFor === deferredSaleId) {
          throw new Error("storage failure");
        }
        staged.pending = staged.pending.filter((sale) => sale.id !== deferredSaleId);
        staged.tasks.push(structuredClone(task));
      },
    });
    this.state = staged;
    return outcome;
  }
}
