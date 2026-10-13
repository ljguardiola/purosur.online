import type { SaleUnit, SearchableProduct } from "@purosur/domain";
import type { SellableProduct } from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";

export function readActiveProductByBarcode(
  database: LocalDatabase,
  code: string,
): SellableProduct | undefined {
  const row = database
    .prepare<[string], { id: string; name: string; sale_unit: string }>(
      `SELECT products.id AS id, products.name AS name, products.sale_unit AS sale_unit
       FROM products
       JOIN product_barcodes ON product_barcodes.product_id = products.id
       WHERE product_barcodes.code = ? AND product_barcodes.active = 1
         AND products.active = 1 AND products.removed = 0
       ORDER BY products.id
       LIMIT 1`,
    )
    .get(code);
  return row === undefined
    ? undefined
    : { id: row.id, name: row.name, saleUnit: row.sale_unit as SaleUnit };
}

export function readActiveProductById(
  database: LocalDatabase,
  productId: string,
): SellableProduct | undefined {
  const row = database
    .prepare<[string], { id: string; name: string; sale_unit: string }>(
      `SELECT id, name, sale_unit FROM products
       WHERE id = ? AND active = 1 AND removed = 0`,
    )
    .get(productId);
  return row === undefined
    ? undefined
    : { id: row.id, name: row.name, saleUnit: row.sale_unit as SaleUnit };
}

export function readSearchableProducts(database: LocalDatabase): SearchableProduct[] {
  return database
    .prepare<[], { id: string; name: string; sale_unit: string; times_sold_here: number }>(
      `SELECT products.id AS id, products.name AS name, products.sale_unit AS sale_unit,
         (SELECT count(*) FROM sale_lines
          JOIN sales ON sales.id = sale_lines.sale_id
          WHERE sale_lines.product_id = products.id AND sales.state = 'COMPLETED'
            AND sales.register_id IN (SELECT id FROM own_register WHERE removed = 0)
         ) AS times_sold_here
       FROM products
       WHERE products.active = 1 AND products.removed = 0
       ORDER BY products.id`,
    )
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      saleUnit: row.sale_unit as SaleUnit,
      timesSoldHere: row.times_sold_here,
    }));
}
