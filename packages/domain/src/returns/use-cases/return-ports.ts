import type { CashMovement } from "../../register/index.js";
import type { OutboxEventDraft } from "../../shared/index.js";
import type { TicketSource } from "../model/return-reasons.js";
import type { SaleForReturn } from "../model/return-sale.js";
import type {
  ReturnedLine,
  ReturnedRefund,
  ReturnedStockMovement,
} from "../model/returned-sale.js";
import type { TicketReference } from "../model/ticket-reference.js";
import type { LocalReturnOfSale } from "../model/uncounted-returns.js";

export type SaleReturnSearch = TicketReference | { kind: "sale"; saleId: string };

export interface ReturnSaleReader {
  saleForReturn(search: SaleReturnSearch): SaleForReturn | undefined;
  goodConditionReturnDays(): number;
}

export interface BranchSaleFacts {
  sale: SaleForReturn;
  goodConditionReturnDays: number;
  countedReturnIds: string[];
}

export type BranchSaleLookupAnswer =
  | ({ kind: "found" } & BranchSaleFacts)
  | { kind: "not_found" }
  | { kind: "unreachable" };

export interface BranchSaleLookup {
  saleForReturn(ticket: TicketReference): Promise<BranchSaleLookupAnswer>;
}

export interface OwnReturnsOfSale {
  returnsOfSale(saleId: string): LocalReturnOfSale[];
}

export type KeptBranchSale = BranchSaleFacts;

export interface RetainedBranchSales {
  keep(sale: KeptBranchSale): void;
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

export interface ReturnTransaction extends ReturnSaleReader {
  openSession(): ReturningSession | undefined;
  outboxReady(): boolean;
  recordReturn(returned: RecordedReturn): void;
  recordRefund(refund: ReturnRefund): void;
  recordCashMovement(movement: ReturnCashMovement): void;
  recordReturnStockMovement(movement: ReturnStockMovement): void;
  addToStockBalance(productId: string, delta: number): void;
  appendOutboxEvent(draft: OutboxEventDraft): void;
}
