import { PRODUCTS_COUNTED_IN_CATALOG } from "../model/product-activity.js";
import type { CatalogBrandSummary, CatalogListReader } from "./catalog-list-reader.js";

export interface FindBrandSummaryPorts {
  catalog: CatalogListReader;
}

export function findBrandSummary(
  { catalog }: FindBrandSummaryPorts,
  brandId: string,
): Promise<CatalogBrandSummary | undefined> {
  return catalog.brand(brandId, PRODUCTS_COUNTED_IN_CATALOG);
}
