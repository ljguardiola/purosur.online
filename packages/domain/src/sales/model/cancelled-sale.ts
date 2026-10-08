import type {
  CompletedSaleCashMovement,
  CompletedSaleLine,
  CompletedSalePayment,
} from "./completed-sale.js";
import type { PlannedRefund } from "./payment-refund.js";

export interface CancelledSaleRefund extends PlannedRefund {
  id: string;
  occurredAt: Date;
}

export interface CancelledSale {
  id: string;
  sessionId: string;
  actorId: string;
  authorizedBy: string | null;
  cancelledAt: Date;
  total: number;
  lines: CompletedSaleLine[];
  payments: CompletedSalePayment[];
  refunds: CancelledSaleRefund[];
  cashMovements: CompletedSaleCashMovement[];
}
