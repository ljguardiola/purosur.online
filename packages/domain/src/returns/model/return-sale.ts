import type { SaleUnit } from "../../catalog/index.js";
import type { Sale, SettledSaleLine } from "../../sales/index.js";
import type { ReturnablePayment } from "./refund-allocation.js";
import type { ReturnSaleLine } from "./return-draft.js";

export interface ReturnedFromLine {
  saleLineId: string;
  quantity: number;
  refundedAmount: number;
}

type SaleLineForReturn = Pick<
  SettledSaleLine,
  "id" | "productId" | "productName" | "saleUnit" | "quantity" | "promotionId" | "lineTotal"
>;

type SaleOfReturn = Sale & { lines: SaleLineForReturn[] };

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
  return sale.lines.map((line) => {
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
