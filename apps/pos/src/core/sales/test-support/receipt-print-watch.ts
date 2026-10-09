import type { ReceiptPrintWatch } from "@purosur/domain/sales/use-cases";

type Status = Parameters<ReceiptPrintWatch["onStatus"]>[0];

export class ReceiptPrintObserver {
  readonly statuses: Status[] = [];
  readonly abort = new AbortController();
  private waiters: Array<() => void> = [];

  readonly watch: ReceiptPrintWatch = {
    onStatus: (status) => {
      this.statuses.push(status);
      const waiters = this.waiters;
      this.waiters = [];
      for (const wake of waiters) wake();
    },
    signal: this.abort.signal,
  };

  async whenStatusCount(count: number): Promise<void> {
    while (this.statuses.length < count) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }
}

export function settled(promise: Promise<unknown>): { done: boolean } {
  const state = { done: false };
  void promise.then(() => {
    state.done = true;
  });
  return state;
}
