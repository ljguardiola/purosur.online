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
}

export type FakeReturnLedgerWrite =
  | "recordReturn"
  | "recordRefund"
  | "recordCashMovement"
  | "recordReturnStockMovement"
  | "addToStockBalance"
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
