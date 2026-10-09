import type { PrinterStatus } from "../../model/receipt-print-standing.js";
import type { ReceiptPrintEnding, ReceiptPrinter, ReceiptPrintWatch } from "../receipt-ports.js";
import type { FakeReceiptLedger, FakeReceiptLedgerState } from "./fake-receipt-ledger.js";

export interface SentReceipt {
  bytes: Uint8Array;
  watch: ReceiptPrintWatch;
  ledgerStateWhenSent: FakeReceiptLedgerState;
}

export class FakeReceiptPrinter implements ReceiptPrinter {
  sent: SentReceipt[] = [];
  private readonly ledger: FakeReceiptLedger;
  private endings: ((ending: ReceiptPrintEnding) => void)[] = [];
  private waiters: { count: number; resolve: () => void }[] = [];

  constructor(ledger: FakeReceiptLedger) {
    this.ledger = ledger;
  }

  print(bytes: Uint8Array, watch: ReceiptPrintWatch): Promise<ReceiptPrintEnding> {
    this.sent.push({ bytes, watch, ledgerStateWhenSent: structuredClone(this.ledger.state) });
    for (const waiter of this.waiters) {
      if (this.sent.length >= waiter.count) {
        waiter.resolve();
      }
    }
    return new Promise((resolve) => {
      this.endings.push(resolve);
    });
  }

  whenSent(count = 1): Promise<void> {
    if (this.sent.length >= count) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push({ count, resolve });
    });
  }

  report(status: PrinterStatus): void {
    this.lastWatch().onStatus(status);
  }

  acknowledge(): void {
    this.end({ kind: "acknowledged" });
  }

  abandon(): void {
    this.end({ kind: "abandoned" });
  }

  private lastWatch(): ReceiptPrintWatch {
    const last = this.sent.at(-1);
    if (last === undefined) {
      throw new Error("nothing was sent");
    }
    return last.watch;
  }

  private end(ending: ReceiptPrintEnding): void {
    const resolve = this.endings.at(-1);
    if (resolve === undefined) {
      throw new Error("nothing was sent");
    }
    resolve(ending);
  }
}
