import type { SaleUnit } from "../../catalog/index.js";
import type { SoldQuantity } from "../../pricing/index.js";
import { mayBeMovementQuantity, soldStockDelta } from "../../stock/index.js";
import { chargeLine } from "./line-pricing.js";
import type { LinePromotion, SaleLine } from "./sale.js";
import type { WeightSource } from "./weight-source.js";

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
      saleUnit: "UNIT",
      weightSource: null,
    },
    1,
  );
}

export function newWeighedSaleLine(
  id: string,
  product: SoldProduct,
  price: ListPrice,
  promotions: readonly LinePromotion[],
  thousandths: number,
  weightSource: WeightSource,
): SaleLine {
  return priced(
    {
      id,
      productId: product.id,
      productName: product.name,
      listUnitPrice: price.unitPrice,
      priceListId: price.priceListId,
      promotions: [...promotions],
      saleUnit: "KG",
      weightSource,
    },
    thousandths,
  );
}

export function withWeight(
  line: SaleLine,
  thousandths: number,
  weightSource: WeightSource,
): SaleLine {
  return priced({ ...line, weightSource }, thousandths);
}

export function saleUnitOfWeightSource(weightSource: WeightSource | null): SaleUnit {
  return weightSource === null ? "UNIT" : "KG";
}

export function addUnitToLine(line: SaleLine): SaleLine {
  return withQuantity(line, line.quantity + 1);
}

export function withQuantity(line: SaleLine, quantity: number): SaleLine {
  return priced(line, quantity);
}

export function soldQuantity(line: Pick<SaleLine, "quantity" | "saleUnit">): SoldQuantity {
  return line.saleUnit === "KG"
    ? { saleUnit: "KG", thousandths: line.quantity }
    : { saleUnit: "UNIT", units: line.quantity };
}

export function soldLineStockDelta(line: Pick<SaleLine, "quantity" | "saleUnit">): number {
  return soldStockDelta(soldQuantity(line));
}

export function mayBeSaleLineQuantity(quantity: number, saleUnit: SaleUnit): boolean {
  return (
    Number.isInteger(quantity) && mayBeMovementQuantity(-soldLineStockDelta({ quantity, saleUnit }))
  );
}

function priced(
  line: Omit<SaleLine, "quantity" | "promotionId" | "discountAmount" | "lineTotal">,
  quantity: number,
): SaleLine {
  const { promotionId, discountAmount, lineTotal } = chargeLine(
    soldQuantity({ quantity, saleUnit: line.saleUnit }),
    line.listUnitPrice,
    line.promotions,
  );
  return { ...line, quantity, promotionId, discountAmount, lineTotal };
}

export function saleTotal(lines: readonly Pick<SaleLine, "lineTotal">[]): number {
  return lines.reduce((total, line) => total + line.lineTotal, 0);
}
