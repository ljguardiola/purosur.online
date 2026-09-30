import type { AddProductToSaleOutcome } from "./add-product-to-sale.js";
import { addProductToSale } from "./add-product-to-sale.js";
import type { Clock, IdGenerator, SaleLedger } from "./sale-ledger.js";

export interface AddSearchedProductInput {
  actorId: string;
  productId: string;
}

export interface AddSearchedProductPorts {
  ledger: SaleLedger;
  clock: Clock;
  ids: IdGenerator;
}

export type AddSearchedProductOutcome =
  | Exclude<AddProductToSaleOutcome, { kind: "product_not_found" }>
  | { kind: "product_unavailable" };

export function addSearchedProduct(
  { ledger, clock, ids }: AddSearchedProductPorts,
  { actorId, productId }: AddSearchedProductInput,
): AddSearchedProductOutcome {
  const outcome = ledger.transaction((tx) =>
    addProductToSale(tx, {
      actorId,
      clock,
      ids,
      findProduct: () => tx.activeProductById(productId),
    }),
  );
  return outcome.kind === "product_not_found" ? { kind: "product_unavailable" } : outcome;
}
