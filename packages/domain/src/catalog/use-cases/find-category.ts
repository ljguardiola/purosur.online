import type { CatalogListReader } from "./catalog-list-reader.js";
import type { CatalogCategory } from "./catalog-store.js";

export interface FindCategoryPorts {
  catalog: CatalogListReader;
}

export function findCategory(
  { catalog }: FindCategoryPorts,
  categoryId: string,
): Promise<CatalogCategory | undefined> {
  return catalog.category(categoryId);
}
