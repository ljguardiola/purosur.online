import type { SaleWithLines } from "../model/sale.js";
import type { SaleLedgerTransaction } from "./sale-ledger.js";

export function withoutSaleDiscount(
  tx: SaleLedgerTransaction,
  sale: SaleWithLines,
): { sale: SaleWithLines; removedSaleDiscount: boolean } {
  if (sale.saleDiscount === null) {
    return { sale, removedSaleDiscount: false };
  }
  tx.recordSaleDiscount(sale.id, null);
  return { sale: { ...sale, saleDiscount: null }, removedSaleDiscount: true };
}
