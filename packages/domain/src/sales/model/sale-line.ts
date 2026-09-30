import type { SaleLine } from "./sale.js";

export interface SoldProduct {
  id: string;
  name: string;
}

export interface ListPrice {
  priceListId: string;
  unitPrice: number;
}

export function newSaleLine(id: string, product: SoldProduct, price: ListPrice): SaleLine {
  return {
    id,
    productId: product.id,
    productName: product.name,
    quantity: 1,
    listUnitPrice: price.unitPrice,
    priceListId: price.priceListId,
    lineTotal: price.unitPrice,
  };
}

export function addUnitToLine(line: SaleLine): SaleLine {
  const quantity = line.quantity + 1;
  return { ...line, quantity, lineTotal: quantity * line.listUnitPrice };
}

export function saleTotal(lines: readonly SaleLine[]): number {
  return lines.reduce((total, line) => total + line.lineTotal, 0);
}
