import type { SoldQuantity } from "../../pricing/index.js";
import { chargeLine } from "./line-pricing.js";
import type { LinePromotion, SaleLine } from "./sale.js";

export interface SoldProduct {
  id: string;
  name: string;
}

export interface ListPrice {
  priceListId: string;
  unitPrice: number;
}

export function newSaleLine(
  id: string,
  product: SoldProduct,
  price: ListPrice,
  promotions: readonly LinePromotion[],
): SaleLine {
  return priced(
    {
      id,
      productId: product.id,
      productName: product.name,
      listUnitPrice: price.unitPrice,
      priceListId: price.priceListId,
      promotions: [...promotions],
    },
    1,
  );
}

export function addUnitToLine(line: SaleLine): SaleLine {
  return withQuantity(line, line.quantity + 1);
}

export function withQuantity(line: SaleLine, quantity: number): SaleLine {
  return priced(line, quantity);
}

export function soldQuantity(line: Pick<SaleLine, "quantity">): SoldQuantity {
  return { saleUnit: "UNIT", units: line.quantity };
}

function priced(
  line: Omit<SaleLine, "quantity" | "promotionId" | "discountAmount" | "lineTotal">,
  quantity: number,
): SaleLine {
  const { promotionId, discountAmount, lineTotal } = chargeLine(
    soldQuantity({ quantity }),
    line.listUnitPrice,
    line.promotions,
  );
  return { ...line, quantity, promotionId, discountAmount, lineTotal };
}

export function saleTotal(lines: readonly Pick<SaleLine, "lineTotal">[]): number {
  return lines.reduce((total, line) => total + line.lineTotal, 0);
}
