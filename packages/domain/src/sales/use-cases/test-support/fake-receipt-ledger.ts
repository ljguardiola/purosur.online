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
  id: string;
  authorized: boolean;
  content: CreditNoteReceiptContent;
}

export interface FakeReceiptSale extends FakeDocumentPrinting {
  id: string;
  completed: boolean;
  voided: boolean;
  source: ReceiptSource;
  creditNote?: FakeCreditNote;
  returnCreditNotes?: FakeCreditNote[];
  deferredInvoice?: FakeDocumentPrinting;
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
    const findCreditNote = (
      sale: FakeReceiptSale | undefined,
      creditNoteId: string,
    ): FakeCreditNote | undefined =>
      [sale?.creditNote, ...(sale?.returnCreditNotes ?? [])].find(
        (note) => note?.id === creditNoteId,
      );
    const creditNoteOf = (saleId: string, creditNoteId: string): FakeCreditNote => {
      const creditNote = findCreditNote(saleOf(saleId), creditNoteId);
      if (creditNote === undefined) {
        throw new Error(`no credit note ${creditNoteId} of sale ${saleId}`);
      }
      return creditNote;
    };
    const deferredInvoiceOf = (saleId: string): FakeDocumentPrinting => {
      const sale = saleOf(saleId);
      sale.deferredInvoice ??= structuredClone(NEVER_PRINTED);
      return sale.deferredInvoice;
    };
    const printingOf = (key: PrintedDocumentKey): FakeDocumentPrinting => {
      if (key.document === "credit_note") {
        return creditNoteOf(key.saleId, key.creditNoteId);
      }
      return key.document === "deferred_invoice"
        ? deferredInvoiceOf(key.saleId)
        : saleOf(key.saleId);
    };
    const outcome = work({
      receiptDelivery: (key): ReceiptDelivery | undefined => {
        const sale = working.sales.find(({ id }) => id === key.saleId);
        if (!(sale?.completed || sale?.voided)) {
          return undefined;
        }
        const creditNote =
          key.document === "credit_note" ? findCreditNote(sale, key.creditNoteId) : undefined;
        const printing =
          {
            credit_note: creditNote,
            deferred_invoice: sale.deferredInvoice,
            sale_receipt: sale,
          }[key.document] ?? NEVER_PRINTED;
        return {
          printAttemptedAt: printing.printAttemptedAt,
          printedAt: printing.printedAt,
          reprintCount: printing.reprints.length,
          voided: sale.voided,
          creditNoteAuthorized: creditNote?.authorized === true,
        };
      },
      receiptSource: (saleId) => structuredClone(saleOf(saleId).source),
      creditNoteContent: (creditNoteId) => {
        const sale = working.sales.find(({ creditNote, returnCreditNotes }) =>
          [creditNote, ...(returnCreditNotes ?? [])].some((note) => note?.id === creditNoteId),
        );
        if (sale === undefined) {
          throw new Error(`no credit note ${creditNoteId}`);
        }
        return structuredClone(creditNoteOf(sale.id, creditNoteId).content);
      },
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
      recordReprint: (key, reprint) => {
        printingOf(key).reprints.push(reprint);
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
