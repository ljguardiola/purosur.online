import { isProductNameTooLong, type SaleUnit } from "../../catalog/index.js";
import type { NameMatch } from "../model/product-name-match.js";
import { rankProductSearch } from "../model/product-search.js";
import type { Clock, SaleLedger } from "./sale-ledger.js";
import { isRefusal, type SellingSessionRefusal, sellingSession } from "./selling-session.js";

export interface SearchProductsByNameInput {
  actorId: string;
  query: string;
}

export interface SearchProductsByNamePorts {
  ledger: SaleLedger;
  clock: Clock;
}

export interface FoundProduct {
  productId: string;
  name: string;
  saleUnit: SaleUnit;
  unitPrice: number | null;
  matches: NameMatch[];
}

export type SearchProductsByNameOutcome =
  | SellingSessionRefusal
  | { kind: "results"; products: FoundProduct[]; more: boolean };

export function searchProductsByName(
  { ledger, clock }: SearchProductsByNamePorts,
  { actorId, query }: SearchProductsByNameInput,
): SearchProductsByNameOutcome {
  return ledger.transaction<SearchProductsByNameOutcome>((tx) => {
    const session = sellingSession(tx, actorId);
    if (isRefusal(session)) {
      return session;
    }
    if (isProductNameTooLong(query)) {
      return { kind: "results", products: [], more: false };
    }
    const moment = clock.now();
    const { hits, more } = rankProductSearch(tx.searchableProducts(), query);
    const products = hits.map(({ product, matches }) => ({
      productId: product.id,
      name: product.name,
      saleUnit: product.saleUnit,
      unitPrice: tx.priceAt(product.id, moment)?.unitPrice ?? null,
      matches,
    }));
    return { kind: "results", products, more };
  });
}
