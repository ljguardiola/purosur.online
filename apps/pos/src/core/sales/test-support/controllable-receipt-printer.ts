import type {
  ReceiptPrintEnding,
  ReceiptPrinter,
  ReceiptPrintWatch,
} from "@purosur/domain/sales/use-cases";

type Status = Parameters<ReceiptPrintWatch["onStatus"]>[0];

interface Waiting {
  watch: ReceiptPrintWatch;
  sending: () => Uint8Array;
  end: (ending: ReceiptPrintEnding) => void;
}

export class ControllableReceiptPrinter implements ReceiptPrinter {
  readonly waiting: Waiting[] = [];
  readonly handed: Uint8Array[] = [];
  private waiters: { count: number; resolve: () => void }[] = [];

  print(watch: ReceiptPrintWatch, sending: () => Uint8Array): Promise<ReceiptPrintEnding> {
    return new Promise((resolve) => {
      watch.signal.addEventListener("abort", () => resolve({ kind: "abandoned" }), { once: true });
      this.waiting.push({ watch, sending, end: resolve });
      for (const waiter of this.waiters) {
        if (this.waiting.length >= waiter.count) waiter.resolve();
      }
    });
  }

  whenWaiting(count = 1): Promise<void> {
    if (this.waiting.length >= count) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push({ count, resolve }));
  }

  report(status: Status, index = this.waiting.length - 1): void {
    this.at(index).watch.onStatus(status);
  }

  becomeReady(index = this.waiting.length - 1): void {
    const { watch, sending, end } = this.at(index);
    watch.onStatus("ready");
    this.handed.push(sending());
    end({ kind: "sent" });
  }

  private at(index: number): Waiting {
    const waiting = this.waiting[index];
    if (waiting === undefined) throw new Error("nothing is waiting");
    return waiting;
  }
}
