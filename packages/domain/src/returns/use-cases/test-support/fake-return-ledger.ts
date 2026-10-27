import type {
  CreditNoteToIssue,
  FiscalOnlineSignalEvidence,
  Fortnight,
  OfflineCreditNote,
  OfflineCreditNoteClockMark,
  OfflineSeries,
  SaleInvoice,
} from "../../../fiscal/index.js";
import type { OutboxEventDraft } from "../../../shared/index.js";
import type { SaleForReturn } from "../../model/return-sale.js";
import type {
  RecordedReturn,
  ReturnCashMovement,
  ReturningSession,
  ReturnLedger,
  ReturnRefund,
  ReturnSaleReader,
  ReturnStockMovement,
  ReturnTransaction,
  SaleReturnSearch,
} from "../return-ports.js";

export type FakeStoredSale = SaleForReturn & { deferred?: { id: string; shortCode: string } };

export interface FakeReturnLedgerState {
  sales: FakeStoredSale[];
  goodConditionReturnDays: number;
  openSession: ReturningSession | undefined;
  outboxReady: boolean;
  returns: RecordedReturn[];
  refunds: ReturnRefund[];
  cashMovements: ReturnCashMovement[];
  stockMovements: ReturnStockMovement[];
  stockBalances: Record<string, number>;
  outbox: OutboxEventDraft[];
  fiscalDocuments: (SaleInvoice & { saleId: string })[];
  salesAwaitingDeferredInvoice: string[];
  fiscalOnlineEvidence: FiscalOnlineSignalEvidence;
  creditNotes: CreditNoteToIssue[];
  offlineCreditNoteSeries: OfflineSeries;
  offlineAuthorizationCodes: Record<string, string>;
  issuedOfflineCreditNotes: OfflineCreditNote[];
  clockMarks: OfflineCreditNoteClockMark[];
}

export type FakeReturnLedgerWrite =
  | "recordReturn"
  | "recordRefund"
  | "recordCashMovement"
  | "recordReturnStockMovement"
  | "addToStockBalance"
  | "recordPendingCreditNote"
  | "issueOfflineCreditNote"
  | "recordClockMark"
  | "appendOutboxEvent";

function matches(sale: FakeStoredSale, search: SaleReturnSearch): boolean {
  switch (search.kind) {
    case "sale":
      return sale.sale.id === search.saleId;
    case "invoice":
      return (
        sale.invoice?.pointOfSale === search.pointOfSale && sale.invoice.number === search.number
      );
    case "deferred":
      return sale.deferred?.id === search.id && sale.deferred.shortCode === search.shortCode;
  }
}

function found(
  sales: readonly FakeStoredSale[],
  search: SaleReturnSearch,
): SaleForReturn | undefined {
  const sale = sales.find((candidate) => matches(candidate, search));
  if (sale === undefined) {
    return undefined;
  }
  const { deferred: _deferred, ...facts } = structuredClone(sale);
  return facts;
}

export class FakeReturnLedger implements ReturnLedger, ReturnSaleReader {
  state: FakeReturnLedgerState;
  transactions = 0;
  offlineSeriesReads = 0;
  failOn: FakeReturnLedgerWrite | undefined;

  constructor(state: Partial<FakeReturnLedgerState> = {}) {
    this.state = {
      sales: [],
      goodConditionReturnDays: 15,
      openSession: undefined,
      outboxReady: true,
      returns: [],
      refunds: [],
      cashMovements: [],
      stockMovements: [],
      stockBalances: {},
      outbox: [],
      fiscalDocuments: [],
      salesAwaitingDeferredInvoice: [],
      fiscalOnlineEvidence: { lastHealthCheckOkAt: null, tokenValid: false, arcaReachable: false },
      creditNotes: [],
      offlineCreditNoteSeries: {
        pointOfSale: null,
        blocksInAssignmentOrder: [],
        localLastUsed: null,
        taxAuthorityLastAuthorized: null,
        highestSyncedNumber: null,
        clockMark: null,
      },
      offlineAuthorizationCodes: {},
      issuedOfflineCreditNotes: [],
      clockMarks: [],
      ...state,
    };
  }

  saleForReturn(search: SaleReturnSearch): SaleForReturn | undefined {
    return found(this.state.sales, search);
  }

  goodConditionReturnDays(): number {
    return this.state.goodConditionReturnDays;
  }

  transaction<TOutcome>(work: (tx: ReturnTransaction) => TOutcome): TOutcome {
    this.transactions += 1;
    const working = structuredClone(this.state);
    const outcome = work({
      saleForReturn: (search) => found(working.sales, search),
      goodConditionReturnDays: () => working.goodConditionReturnDays,
      openSession: () => structuredClone(working.openSession),
      outboxReady: () => working.outboxReady,
      recordReturn: (returned) => {
        this.failIfAsked("recordReturn");
        working.returns.push(returned);
        const sale = working.sales.find(({ sale: stored }) => stored.id === returned.saleId);
        for (const line of returned.lines) {
          const earlier = sale?.returned.find(({ saleLineId }) => saleLineId === line.saleLineId);
          if (earlier === undefined) {
            sale?.returned.push({
              saleLineId: line.saleLineId,
              quantity: line.quantity,
              refundedAmount: line.refundedAmount,
            });
          } else {
            earlier.quantity += line.quantity;
            earlier.refundedAmount += line.refundedAmount;
          }
        }
      },
      recordRefund: (refund) => {
        this.failIfAsked("recordRefund");
        working.refunds.push(refund);
        const payment = working.sales
          .find(({ sale }) => sale.id === refund.saleId)
          ?.payments.find(({ id }) => id === refund.paymentId);
        if (payment !== undefined) {
          payment.refundedAmount += refund.amount;
        }
      },
      recordCashMovement: (movement) => {
        this.failIfAsked("recordCashMovement");
        working.cashMovements.push(movement);
      },
      recordReturnStockMovement: (movement) => {
        this.failIfAsked("recordReturnStockMovement");
        working.stockMovements.push(movement);
      },
      addToStockBalance: (productId, delta) => {
        this.failIfAsked("addToStockBalance");
        working.stockBalances[productId] = (working.stockBalances[productId] ?? 0) + delta;
      },
      saleInvoiceStanding: (saleId) => ({
        fiscalDocuments: working.fiscalDocuments
          .filter((document) => document.saleId === saleId)
          .map(({ saleId: _saleId, ...document }) => structuredClone(document)),
        deferralPending: working.salesAwaitingDeferredInvoice.includes(saleId),
      }),
      fiscalOnlineEvidence: () => structuredClone(working.fiscalOnlineEvidence),
      offlineCreditNoteSeries: () => {
        this.offlineSeriesReads += 1;
        const series = structuredClone(working.offlineCreditNoteSeries);
        const issued = working.issuedOfflineCreditNotes.map(({ number }) => number);
        return { ...series, localLastUsed: Math.max(series.localLastUsed ?? 0, ...issued) || null };
      },
      offlineAuthorizationCodeOf: ({ start }: Fortnight) =>
        working.offlineAuthorizationCodes[start] ?? null,
      recordPendingCreditNote: (creditNote) => {
        this.failIfAsked("recordPendingCreditNote");
        working.creditNotes.push(creditNote);
      },
      issueOfflineCreditNote: (document) => {
        this.failIfAsked("issueOfflineCreditNote");
        working.issuedOfflineCreditNotes.push(document);
      },
      recordClockMark: (mark) => {
        this.failIfAsked("recordClockMark");
        working.clockMarks.push(mark);
      },
      appendOutboxEvent: (draft) => {
        this.failIfAsked("appendOutboxEvent");
        working.outbox.push(draft);
      },
    });
    this.state = working;
    return outcome;
  }

  private failIfAsked(write: FakeReturnLedgerWrite): void {
    if (this.failOn === write) {
      throw new Error(`${write} failed`);
    }
  }
}
