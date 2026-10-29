import type { NetContentUnit } from "@purosur/domain";
import { formatProductDescription } from "@purosur/ui/formatters";

export interface ShownProductColumns {
  name: string;
  brand_name: string | null;
  net_content_quantity: number | null;
  net_content_unit: NetContentUnit | null;
}

export const SHOWN_PRODUCT_COLUMNS = `products.name AS name, brands.name AS brand_name,
  products.net_content_quantity AS net_content_quantity,
  products.net_content_unit AS net_content_unit`;

export const JOIN_PRODUCT_BRAND = "LEFT JOIN brands ON brands.id = products.brand_id";

export function shownProductName(row: ShownProductColumns): string {
  return formatProductDescription({
    name: row.name,
    brandName: row.brand_name,
    netContent:
      row.net_content_quantity === null || row.net_content_unit === null
        ? null
        : { quantity: row.net_content_quantity, unit: row.net_content_unit },
  });
}
