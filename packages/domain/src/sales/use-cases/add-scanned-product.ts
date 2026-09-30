import type { AddProductToSaleOutcome } from "./add-product-to-sale.js";
import { addProductToSale } from "./add-product-to-sale.js";
import type { Clock, IdGenerator, SaleLedger } from "./sale-ledger.js";

export interface AddScannedProductInput {
  actorId: string;
  code: string;
}

export interface AddScannedProductPorts {
  ledger: SaleLedger;
  clock: Clock;
  ids: IdGenerator;
}

export type AddScannedProductOutcome =
  | Exclude<AddProductToSaleOutcome, { kind: "product_not_found" }>
  | { kind: "unknown_code" };

export function addScannedProduct(
  { ledger, clock, ids }: AddScannedProductPorts,
  { actorId, code }: AddScannedProductInput,
): AddScannedProductOutcome {
  const outcome = ledger.transaction((tx) =>
    addProductToSale(tx, {
      actorId,
      clock,
      ids,
      findProduct: () => tx.activeProductByBarcode(code),
    }),
  );
  return outcome.kind === "product_not_found" ? { kind: "unknown_code" } : outcome;
}
