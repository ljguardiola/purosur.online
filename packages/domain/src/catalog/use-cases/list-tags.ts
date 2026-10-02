import { PRODUCTS_COUNTED_IN_CATALOG } from "../model/product-activity.js";
import type { CatalogListReader, CatalogTagSummary } from "./catalog-list-reader.js";

export interface ListTagsPorts {
  catalog: CatalogListReader;
}

export interface TagList {
  tags: CatalogTagSummary[];
  taggedProductCount: number;
}

export async function listTags({ catalog }: ListTagsPorts): Promise<TagList> {
  const [tags, taggedProductCount] = await Promise.all([
    catalog.tags(PRODUCTS_COUNTED_IN_CATALOG),
    catalog.taggedProductCount(PRODUCTS_COUNTED_IN_CATALOG),
  ]);
  return { tags, taggedProductCount };
}
