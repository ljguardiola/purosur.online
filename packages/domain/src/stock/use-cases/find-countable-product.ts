import {
  isBarcodeTooLong,
  type NameMatch,
  rankProductSearch,
  type SaleUnit,
} from "../../catalog/index.js";
import { type InitialCountRefusal, initialCountRefusal } from "./initial-count-access.js";
import type { CountableProduct, InitialCountLedger } from "./initial-count-ledger.js";

export type FindCountableProductByBarcodeOutcome =
  | InitialCountRefusal
  | { kind: "unknown_code" }
  | { kind: "found"; product: CountableProduct };

export function findCountableProductByBarcode(
  { ledger }: { ledger: InitialCountLedger },
  { actorId, code }: { actorId: string; code: string },
): FindCountableProductByBarcodeOutcome {
  return ledger.transaction<FindCountableProductByBarcodeOutcome>((tx) => {
    const refusal = initialCountRefusal(tx, actorId);
    if (refusal) {
      return refusal;
    }
    const product = isBarcodeTooLong(code) ? undefined : tx.activeProductByBarcode(code);
    return product ? { kind: "found", product } : { kind: "unknown_code" };
  });
}

export interface FoundCountableProduct {
  productId: string;
  name: string;
  saleUnit: SaleUnit;
  matches: NameMatch[];
}

export type SearchCountableProductsByNameOutcome =
  | InitialCountRefusal
  | { kind: "results"; products: FoundCountableProduct[]; more: boolean };

export function searchCountableProductsByName(
  { ledger }: { ledger: InitialCountLedger },
  { actorId, query }: { actorId: string; query: string },
): SearchCountableProductsByNameOutcome {
  return ledger.transaction<SearchCountableProductsByNameOutcome>((tx) => {
    const refusal = initialCountRefusal(tx, actorId);
    if (refusal) {
      return refusal;
    }
    const { hits, more } = rankProductSearch(tx.searchableProducts(), query);
    return {
      kind: "results",
      products: hits.map(({ product, matches }) => ({
        productId: product.id,
        name: product.name,
        saleUnit: product.saleUnit,
        matches,
      })),
      more,
    };
  });
}
