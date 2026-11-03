import type { CancelledSale } from "./cancelled-sale.js";
import type { CompletedSaleStockMovement } from "./completed-sale.js";

export interface VoidedSale extends Omit<CancelledSale, "cancelledAt" | "rebuiltPaidOrder"> {
  voidedAt: Date;
  stockMovements: CompletedSaleStockMovement[];
  deferredRecordCancelled: boolean;
}
