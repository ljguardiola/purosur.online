import type { OutboxEventDraft } from "../../../shared/index.js";
import type { ReceiptSource } from "../../model/receipt-content.js";
import type { ReceiptDelivery } from "../../model/receipt-copy.js";
import type {
  ReceiptLedger,
  ReceiptLedgerTransaction,
  ReceiptReprint,
  StoredReceipt,
} from "../receipt-ports.js";

export interface FakeReceiptSale {
  id: string;
  completed: boolean;
  source: ReceiptSource;
  printAttemptedAt: Date | null;
  printedAt: Date | null;
  stored: StoredReceipt | undefined;
  reprints: ReceiptReprint[];
}

export interface FakeReceiptLedgerState {
  sales: FakeReceiptSale[];
  outbox: OutboxEventDraft[];
  outboxReady: boolean;
}

export class FakeReceiptLedger implements ReceiptLedger {
  state: FakeReceiptLedgerState;
  transactions = 0;

  constructor(state: Partial<FakeReceiptLedgerState> = {}) {
    this.state = { sales: [], outbox: [], outboxReady: true, ...state };
  }

  transaction<TOutcome>(work: (tx: ReceiptLedgerTransaction) => TOutcome): TOutcome {
    this.transactions += 1;
    const working = structuredClone(this.state);
    const saleOf = (saleId: string): FakeReceiptSale => {
      const sale = working.sales.find(({ id }) => id === saleId);
      if (sale === undefined) {
        throw new Error(`no sale ${saleId}`);
      }
      return sale;
    };
    const outcome = work({
      receiptDelivery: (saleId): ReceiptDelivery | undefined => {
        const sale = working.sales.find(({ id }) => id === saleId);
        return sale?.completed
          ? {
              printAttemptedAt: sale.printAttemptedAt,
              printedAt: sale.printedAt,
              reprintCount: sale.reprints.length,
            }
          : undefined;
      },
      receiptSource: (saleId) => structuredClone(saleOf(saleId).source),
      storedReceipt: (saleId) => saleOf(saleId).stored,
      recordStoredReceipt: (saleId, receipt) => {
        saleOf(saleId).stored = receipt;
      },
      recordPrintAttempt: (saleId, at) => {
        saleOf(saleId).printAttemptedAt = at;
      },
      recordPrinted: (saleId, at) => {
        saleOf(saleId).printedAt = at;
      },
      recordReprint: (reprint) => {
        saleOf(reprint.saleId).reprints.push(reprint);
      },
      outboxReady: () => working.outboxReady,
      appendOutboxEvent: (draft) => {
        working.outbox.push(draft);
      },
    });
    this.state = working;
    return outcome;
  }
}
