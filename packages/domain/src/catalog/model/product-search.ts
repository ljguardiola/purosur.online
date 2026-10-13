import { compareSpanishText } from "../../shared/index.js";
import type { SaleUnit } from "./product.js";
import { matchProductName, type NameMatch } from "./product-name-match.js";

export const SEARCH_RESULT_LIMIT = 20;

export interface SearchableProduct {
  id: string;
  name: string;
  saleUnit: SaleUnit;
  timesSoldHere: number;
}

interface ProductSearchHit {
  product: SearchableProduct;
  matches: NameMatch[];
}

export interface ProductSearchRanking {
  hits: ProductSearchHit[];
  more: boolean;
}

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
    compareSpanishText(a.name, b.name) ||
    compareSpanishText(a.id, b.id)
  );
}
