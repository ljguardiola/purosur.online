import type { Clock } from "../../shared/index.js";
import type { AddProductToSaleOutcome } from "./add-product-to-sale.js";
import { addProductToSale } from "./add-product-to-sale.js";
import type { RegisterRestoration } from "./register-restoration.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";

export interface AddSearchedProductInput {
  actorId: string;
  productId: string;
}

export interface AddSearchedProductPorts {
  ledger: SaleLedger;
  restoration: RegisterRestoration;
  clock: Clock;
  ids: IdGenerator;
}

export type AddSearchedProductOutcome =
  | Exclude<AddProductToSaleOutcome, { kind: "product_not_found" }>
  | { kind: "product_unavailable" };

export function addSearchedProduct(
  { ledger, restoration, clock, ids }: AddSearchedProductPorts,
  { actorId, productId }: AddSearchedProductInput,
): AddSearchedProductOutcome {
  const outcome = ledger.transaction((tx) =>
    addProductToSale(tx, {
      actorId,
      clock,
      ids,
      restoration,
      findProduct: () => tx.activeProductById(productId),
    }),
  );
  return outcome.kind === "product_not_found" ? { kind: "product_unavailable" } : outcome;
}
