import type { SaleCreditNoteTransaction, SaleInvoiceStanding } from "../../fiscal/index.js";
import type { CashMovement } from "../../register/index.js";
import type { TicketSource } from "../model/return-reasons.js";
import type { SaleForReturn } from "../model/return-sale.js";
import type {
  ReturnedLine,
  ReturnedRefund,
  ReturnedStockMovement,
} from "../model/returned-sale.js";
import type { TicketReference } from "../model/ticket-reference.js";

export type SaleReturnSearch = TicketReference | { kind: "sale"; saleId: string };

export interface ReturnSaleReader {
  saleForReturn(search: SaleReturnSearch): SaleForReturn | undefined;
  goodConditionReturnDays(): number;
}

export interface IdGenerator {
  next(): string;
}

export interface ReturningSession {
  id: string;
  openedBy: string;
}

export interface RecordedReturn {
  id: string;
  saleId: string;
  sessionId: string;
  actorId: string;
  authorizedBy: string | null;
  ticketSource: TicketSource;
  occurredAt: Date;
  refundedTotal: number;
  lines: ReturnedLine[];
}

export interface ReturnRefund extends ReturnedRefund {
  returnId: string;
  saleId: string;
}

export type ReturnCashMovement = CashMovement & {
  type: "REFUND";
  ref: { type: "return"; id: string };
};

export interface ReturnStockMovement extends ReturnedStockMovement {
  returnId: string;
  occurredAt: Date;
}

export interface ReturnLedger {
  transaction<TOutcome>(work: (tx: ReturnTransaction) => TOutcome): TOutcome;
}

export interface ReturnTransaction extends ReturnSaleReader, SaleCreditNoteTransaction {
  openSession(): ReturningSession | undefined;
  outboxReady(): boolean;
  saleInvoiceStanding(saleId: string): SaleInvoiceStanding;
  recordReturn(returned: RecordedReturn): void;
  recordRefund(refund: ReturnRefund): void;
  recordCashMovement(movement: ReturnCashMovement): void;
  recordReturnStockMovement(movement: ReturnStockMovement): void;
  addToStockBalance(productId: string, delta: number): void;
}
