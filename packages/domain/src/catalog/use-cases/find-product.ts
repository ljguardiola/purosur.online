import type { CatalogListReader } from "./catalog-list-reader.js";
import type { CatalogProduct } from "./catalog-store.js";

export interface FindProductPorts {
  catalog: CatalogListReader;
}

export function findProduct(
  { catalog }: FindProductPorts,
  productId: string,
): Promise<CatalogProduct | undefined> {
  return catalog.product(productId);
}
