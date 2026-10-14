import { amountToCharge } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";
import { type SaleDiscountColumns, toSaleDiscount } from "./sqlite-sale-discount";

export function saleTotalOf(database: LocalDatabase, saleId: string): number {
  const lines = database
    .prepare<[string], { lineTotal: number }>(
      "SELECT line_total AS lineTotal FROM sale_lines WHERE sale_id = ?",
    )
    .all(saleId);
  const discount = database
    .prepare<[string], SaleDiscountColumns>(
      `SELECT sale_discount_kind, sale_discount_value, sale_discount_reason,
              sale_discount_authorized_by
       FROM sales WHERE id = ?`,
    )
    .get(saleId);
  return amountToCharge({
    lines,
    saleDiscount: discount === undefined ? null : toSaleDiscount(discount),
  });
}
