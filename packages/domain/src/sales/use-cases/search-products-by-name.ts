import {
  isProductNameTooLong,
  type NameMatch,
  rankProductSearch,
  type SaleUnit,
} from "../../catalog/index.js";
import type { RegisterRestoration } from "./register-restoration.js";
import type { SaleLedger } from "./sale-ledger.js";
import { isRefusal, type SellingSessionRefusal, sellingSession } from "./selling-session.js";

export interface SearchProductsByNameInput {
  actorId: string;
  query: string;
}

export interface SearchProductsByNamePorts {
  ledger: SaleLedger;
  restoration: RegisterRestoration;
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
  { ledger, restoration }: SearchProductsByNamePorts,
  { actorId, query }: SearchProductsByNameInput,
): SearchProductsByNameOutcome {
  return ledger.transaction<SearchProductsByNameOutcome>((tx) => {
    const session = sellingSession(tx, actorId, restoration);
    if (isRefusal(session)) {
      return session;
    }
    if (isProductNameTooLong(query)) {
      return { kind: "results", products: [], more: false };
    }
    const { hits, more } = rankProductSearch(tx.searchableProducts(), query);
    const products = hits.map(({ product, matches }) => ({
      productId: product.id,
      name: product.name,
      saleUnit: product.saleUnit,
      unitPrice: tx.currentPrice(product.id)?.unitPrice ?? null,
      matches,
    }));
    return { kind: "results", products, more };
  });
}
