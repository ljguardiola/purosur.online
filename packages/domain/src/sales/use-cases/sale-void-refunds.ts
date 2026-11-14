import type { PlannedRefundState, PointCardType } from "../../payments/index.js";
import type { SaleHistoryRecord } from "./register-sales-history.js";

export interface SaleVoidRefund {
  method: SaleHistoryRecord["payments"][number]["method"];
  cardType: PointCardType | null;
  amount: number;
  state: PlannedRefundState;
}

export interface SaleVoidRefunds {
  refundsOfVoid(saleId: string): SaleVoidRefund[];
}
