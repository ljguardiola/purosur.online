import type { OutboxEventDraft } from "../../../shared/index.js";
import type { CreditNoteReceiptContent } from "../../model/credit-note-receipt-content.js";
import type { PrintedDocumentKey } from "../../model/printed-document.js";
import type { ReceiptSource } from "../../model/receipt-content.js";
import type { ReceiptDelivery } from "../../model/receipt-copy.js";
import type {
  ReceiptLedger,
  ReceiptLedgerTransaction,
  ReceiptReprint,
  StoredReceipt,
} from "../receipt-ports.js";

interface FakeDocumentPrinting {
  printAttemptedAt: Date | null;
  printedAt: Date | null;
  stored: StoredReceipt | undefined;
  reprints: ReceiptReprint[];
}

export interface FakeCreditNote extends FakeDocumentPrinting {
  authorized: boolean;
  content: CreditNoteReceiptContent;
}

export interface FakeReceiptSale extends FakeDocumentPrinting {
  id: string;
  completed: boolean;
  voided: boolean;
  source: ReceiptSource;
  creditNote?: FakeCreditNote;
}

export interface FakeReceiptLedgerState {
  sales: FakeReceiptSale[];
  outbox: OutboxEventDraft[];
  outboxReady: boolean;
}

const NEVER_PRINTED: FakeDocumentPrinting = {
  printAttemptedAt: null,
  printedAt: null,
  stored: undefined,
  reprints: [],
};

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
    const creditNoteOf = (saleId: string): FakeCreditNote => {
      const { creditNote } = saleOf(saleId);
      if (creditNote === undefined) {
        throw new Error(`no credit note of sale ${saleId}`);
      }
      return creditNote;
    };
    const printingOf = ({ document, saleId }: PrintedDocumentKey): FakeDocumentPrinting =>
      document === "credit_note" ? creditNoteOf(saleId) : saleOf(saleId);
    const outcome = work({
      receiptDelivery: ({ document, saleId }): ReceiptDelivery | undefined => {
        const sale = working.sales.find(({ id }) => id === saleId);
        if (!(sale?.completed || sale?.voided)) {
          return undefined;
        }
        const printing = document === "credit_note" ? (sale.creditNote ?? NEVER_PRINTED) : sale;
        return {
          printAttemptedAt: printing.printAttemptedAt,
          printedAt: printing.printedAt,
          reprintCount: printing.reprints.length,
          voided: sale.voided,
          creditNoteAuthorized: sale.creditNote?.authorized === true,
        };
      },
      receiptSource: (saleId) => structuredClone(saleOf(saleId).source),
      creditNoteContent: (saleId) => structuredClone(creditNoteOf(saleId).content),
      storedReceipt: (key) => printingOf(key).stored,
      recordStoredReceipt: (key, receipt) => {
        printingOf(key).stored = receipt;
      },
      recordPrintAttempt: (key, at) => {
        printingOf(key).printAttemptedAt = at;
      },
      recordPrinted: (key, at) => {
        printingOf(key).printedAt = at;
      },
      recordReprint: (reprint) => {
        printingOf(reprint).reprints.push(reprint);
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
