import type {
  ReceiptPrintEnding,
  ReceiptPrinter,
  ReceiptPrintWatch,
} from "@purosur/domain/sales/use-cases";

type Status = Parameters<ReceiptPrintWatch["onStatus"]>[0];

interface Sent {
  bytes: Uint8Array;
  watch: ReceiptPrintWatch;
  end: (ending: ReceiptPrintEnding) => void;
}

export class ControllableReceiptPrinter implements ReceiptPrinter {
  readonly sent: Sent[] = [];
  private waiters: { count: number; resolve: () => void }[] = [];

  print(bytes: Uint8Array, watch: ReceiptPrintWatch): Promise<ReceiptPrintEnding> {
    return new Promise((resolve) => {
      watch.signal.addEventListener("abort", () => resolve({ kind: "abandoned" }), { once: true });
      this.sent.push({ bytes, watch, end: resolve });
      for (const waiter of this.waiters) {
        if (this.sent.length >= waiter.count) waiter.resolve();
      }
    });
  }

  whenSent(count = 1): Promise<void> {
    if (this.sent.length >= count) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push({ count, resolve }));
  }

  report(status: Status, index = this.sent.length - 1): void {
    this.at(index).watch.onStatus(status);
  }

  acknowledge(index = this.sent.length - 1): void {
    this.at(index).end({ kind: "acknowledged" });
  }

  private at(index: number): Sent {
    const sent = this.sent[index];
    if (sent === undefined) throw new Error("nothing was sent");
    return sent;
  }
}
