import { PRODUCTS_COUNTED_IN_CATALOG } from "../model/product-activity.js";
import type { CatalogListReader, CatalogTagSummary } from "./catalog-list-reader.js";

export interface FindTagSummaryPorts {
  catalog: CatalogListReader;
}

export function findTagSummary(
  { catalog }: FindTagSummaryPorts,
  tagId: string,
): Promise<CatalogTagSummary | undefined> {
  return catalog.tag(tagId, PRODUCTS_COUNTED_IN_CATALOG);
}
