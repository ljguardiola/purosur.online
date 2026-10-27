import type { PlannedRefund } from "../../payments/index.js";
import type { ReturnDisposition, ReturnReason, TicketSource } from "./return-reasons.js";

export interface ReturnedLine {
  saleLineId: string;
  productId: string;
  quantity: number;
  reason: ReturnReason;
  disposition: ReturnDisposition;
  refundedAmount: number;
}

export interface ReturnedRefund extends PlannedRefund {
  id: string;
  occurredAt: Date;
}

export interface ReturnedCashMovement {
  id: string;
  type: "REFUND";
  amount: number;
  actorId: string;
  occurredAt: Date;
}

export interface ReturnedStockMovement {
  id: string;
  saleLineId: string;
  productId: string;
  kind: "return" | "loss";
  reason: "return_discard" | null;
  delta: number;
}

export interface ReturnedSale {
  id: string;
  saleId: string;
  sessionId: string;
  actorId: string;
  authorizedBy: string | null;
  ticketSource: TicketSource;
  occurredAt: Date;
  lines: ReturnedLine[];
  refunds: ReturnedRefund[];
  cashMovements: ReturnedCashMovement[];
  stockMovements: ReturnedStockMovement[];
}
