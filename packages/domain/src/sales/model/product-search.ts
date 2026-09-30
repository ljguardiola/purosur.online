import type { SaleUnit } from "../../catalog/index.js";
import { matchProductName, type NameMatch } from "./product-name-match.js";

export const SEARCH_RESULT_LIMIT = 20;

export interface SearchableProduct {
  id: string;
  name: string;
  saleUnit: SaleUnit;
  timesSoldHere: number;
}

export interface ProductSearchHit {
  product: SearchableProduct;
  matches: NameMatch[];
}

export interface ProductSearchRanking {
  hits: ProductSearchHit[];
  more: boolean;
}

const TEXT_ORDER = new Intl.Collator("es-AR");

export function rankProductSearch(
  products: readonly SearchableProduct[],
  query: string,
): ProductSearchRanking {
  const hits = products.flatMap((product) => {
    const matches = matchProductName(product.name, query);
    return matches ? [{ product, matches }] : [];
  });
  hits.sort((a, b) => byMostSoldThenName(a.product, b.product));
  return { hits: hits.slice(0, SEARCH_RESULT_LIMIT), more: hits.length > SEARCH_RESULT_LIMIT };
}

function byMostSoldThenName(a: SearchableProduct, b: SearchableProduct): number {
  return (
    b.timesSoldHere - a.timesSoldHere ||
    TEXT_ORDER.compare(a.name, b.name) ||
    TEXT_ORDER.compare(a.id, b.id)
  );
}
