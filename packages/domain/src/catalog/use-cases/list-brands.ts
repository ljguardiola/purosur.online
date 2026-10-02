import { PRODUCTS_COUNTED_IN_CATALOG } from "../model/product-activity.js";
import type { CatalogBrandSummary, CatalogListReader } from "./catalog-list-reader.js";

export interface ListBrandsPorts {
  catalog: CatalogListReader;
}

export function listBrands({ catalog }: ListBrandsPorts): Promise<CatalogBrandSummary[]> {
  return catalog.brands(PRODUCTS_COUNTED_IN_CATALOG);
}
