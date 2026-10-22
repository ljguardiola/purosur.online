import type { DeferredSaleRegularizationTask } from "../../model/deferred-sale-record.js";
import type {
  DeferredSaleExpiryStore,
  DeferredSaleExpiryTransaction,
  PendingDeferredSale,
} from "../regularize-expired-deferred-sales-ports.js";

interface ExpiryState {
  pending: PendingDeferredSale[];
  tasks: DeferredSaleRegularizationTask[];
}

export class FakeDeferredSaleExpiryStore implements DeferredSaleExpiryStore {
  readonly lockedBounds: Date[] = [];
  readonly readSaleIds: string[] = [];
  transactions = 0;
  failOnRecordingFor: string | null = null;
  private state: ExpiryState;

  constructor(pending: readonly PendingDeferredSale[]) {
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
      lockPendingDeferredSalesOccurredBefore: async (instant) => {
        this.lockedBounds.push(new Date(instant));
        const locked = staged.pending.filter(
          (sale) => sale.occurredAt.getTime() < instant.getTime(),
        );
        this.readSaleIds.push(...locked.map((sale) => sale.id));
        return structuredClone(locked);
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
