import type { SaleUnit } from "../../catalog/index.js";
import type { SaleLine, SaleWithLines } from "../../sales/index.js";
import { settledLines } from "../../sales/index.js";
import type { ReturnablePayment } from "./refund-allocation.js";
import type { ReturnSaleLine } from "./return-draft.js";

export interface ReturnedFromLine {
  saleLineId: string;
  quantity: number;
  refundedAmount: number;
}

export type SaleLineForReturn = Pick<
  SaleLine,
  "id" | "productId" | "productName" | "saleUnit" | "quantity" | "promotionId" | "lineTotal"
>;

export type SaleOfReturn = Omit<SaleWithLines, "lines"> & { lines: SaleLineForReturn[] };

export interface SaleForReturn {
  sale: SaleOfReturn;
  occurredAt: Date;
  invoice: { pointOfSale: number; number: number } | null;
  payments: ReturnablePayment[];
  returned: ReturnedFromLine[];
}

export interface ReturnStandingLine extends ReturnSaleLine {
  productId: string;
  productName: string;
  saleUnit: SaleUnit;
}

export function returnSaleLines({
  sale,
  returned,
}: Pick<SaleForReturn, "sale" | "returned">): ReturnStandingLine[] {
  return settledLines(sale).map((line) => {
    const earlier = returned.find(({ saleLineId }) => saleLineId === line.id);
    return {
      id: line.id,
      productId: line.productId,
      productName: line.productName,
      saleUnit: line.saleUnit,
      soldQuantity: line.quantity,
      promotionId: line.promotionId,
      chargedAmount: line.lineTotal,
      returnedQuantity: earlier?.quantity ?? 0,
      refundedAmount: earlier?.refundedAmount ?? 0,
    };
  });
}
