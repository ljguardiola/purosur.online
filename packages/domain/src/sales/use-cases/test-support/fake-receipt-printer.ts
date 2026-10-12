import type { PrinterStatus } from "../../model/receipt-print-standing.js";
import type { ReceiptPrintEnding, ReceiptPrinter, ReceiptPrintWatch } from "../receipt-ports.js";
import type { FakeReceiptLedger, FakeReceiptLedgerState } from "./fake-receipt-ledger.js";

export interface SentReceipt {
  bytes: Uint8Array;
  watch: ReceiptPrintWatch;
  ledgerStateWhenSent: FakeReceiptLedgerState;
}

interface WaitingReceipt {
  watch: ReceiptPrintWatch;
  sending: () => Uint8Array;
  end: (ending: ReceiptPrintEnding) => void;
}

export class FakeReceiptPrinter implements ReceiptPrinter {
  sent: SentReceipt[] = [];
  waiting: WaitingReceipt[] = [];
  private readonly ledger: FakeReceiptLedger;
  private waiters: { count: number; resolve: () => void }[] = [];

  constructor(ledger: FakeReceiptLedger) {
    this.ledger = ledger;
  }

  print(watch: ReceiptPrintWatch, sending: () => Uint8Array): Promise<ReceiptPrintEnding> {
    return new Promise((resolve) => {
      this.waiting.push({ watch, sending, end: resolve });
      for (const waiter of this.waiters) {
        if (this.waiting.length >= waiter.count) {
          waiter.resolve();
        }
      }
    });
  }

  whenWaiting(count = 1): Promise<void> {
    if (this.waiting.length >= count) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push({ count, resolve });
    });
  }

  report(status: PrinterStatus): void {
    this.lastWaiting().watch.onStatus(status);
  }

  becomeReady(): void {
    const { watch, sending, end } = this.lastWaiting();
    watch.onStatus("ready");
    const bytes = sending();
    this.sent.push({ bytes, watch, ledgerStateWhenSent: structuredClone(this.ledger.state) });
    end({ kind: "sent" });
  }

  abandon(): void {
    this.lastWaiting().end({ kind: "abandoned" });
  }

  private lastWaiting(): WaitingReceipt {
    const last = this.waiting.at(-1);
    if (last === undefined) {
      throw new Error("nothing is waiting");
    }
    return last;
  }
}
