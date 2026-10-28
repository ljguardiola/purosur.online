import type { SaleUnit, SearchableProduct } from "@purosur/domain";
import type { SellableProduct } from "@purosur/domain/sales/use-cases";
import { formatProductDescription, type NetContent } from "@purosur/ui/formatters";
import type { LocalDatabase } from "../platform/local-database";

export interface ShownProductColumns {
  name: string;
  brand_name: string | null;
  net_content_quantity: number | null;
  net_content_unit: string | null;
}

export const SHOWN_PRODUCT_COLUMNS = `products.name AS name, brands.name AS brand_name,
  products.net_content_quantity AS net_content_quantity,
  products.net_content_unit AS net_content_unit`;

export const JOIN_PRODUCT_BRAND =
  "LEFT JOIN brands ON brands.id = products.brand_id AND brands.removed = 0";

export function shownProductName(row: ShownProductColumns): string {
  return formatProductDescription({
    name: row.name,
    brandName: row.brand_name,
    netContent:
      row.net_content_quantity === null || row.net_content_unit === null
        ? null
        : {
            quantity: row.net_content_quantity,
            unit: row.net_content_unit as NetContent["unit"],
          },
  });
}

type SellableRow = ShownProductColumns & { id: string; sale_unit: string };

function toSellable(row: SellableRow): SellableProduct {
  return { id: row.id, name: shownProductName(row), saleUnit: row.sale_unit as SaleUnit };
}

export function readActiveProductByBarcode(
  database: LocalDatabase,
  code: string,
): SellableProduct | undefined {
  const row = database
    .prepare<[string], SellableRow>(
      `SELECT products.id AS id, ${SHOWN_PRODUCT_COLUMNS}, products.sale_unit AS sale_unit
       FROM products
       JOIN product_barcodes ON product_barcodes.product_id = products.id
       ${JOIN_PRODUCT_BRAND}
       WHERE product_barcodes.code = ? AND product_barcodes.active = 1
         AND products.active = 1 AND products.removed = 0
       ORDER BY products.id
       LIMIT 1`,
    )
    .get(code);
  return row === undefined ? undefined : toSellable(row);
}

export function readActiveProductById(
  database: LocalDatabase,
  productId: string,
): SellableProduct | undefined {
  const row = database
    .prepare<[string], SellableRow>(
      `SELECT products.id AS id, ${SHOWN_PRODUCT_COLUMNS}, products.sale_unit AS sale_unit
       FROM products
       ${JOIN_PRODUCT_BRAND}
       WHERE products.id = ? AND products.active = 1 AND products.removed = 0`,
    )
    .get(productId);
  return row === undefined ? undefined : toSellable(row);
}

export function readSearchableProducts(database: LocalDatabase): SearchableProduct[] {
  return database
    .prepare<[], SellableRow & { times_sold_here: number }>(
      `SELECT products.id AS id, ${SHOWN_PRODUCT_COLUMNS}, products.sale_unit AS sale_unit,
         (SELECT count(*) FROM sale_lines
          JOIN sales ON sales.id = sale_lines.sale_id
          WHERE sale_lines.product_id = products.id AND sales.state = 'COMPLETED'
            AND sales.register_id IN (SELECT id FROM own_register WHERE removed = 0)
         ) AS times_sold_here
       FROM products
       ${JOIN_PRODUCT_BRAND}
       WHERE products.active = 1 AND products.removed = 0
       ORDER BY products.id`,
    )
    .all()
    .map((row) => ({ ...toSellable(row), timesSoldHere: row.times_sold_here }));
}
