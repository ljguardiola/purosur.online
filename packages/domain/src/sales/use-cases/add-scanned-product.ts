import { isBarcodeTooLong } from "../../catalog/index.js";
import type { Clock } from "../../shared/index.js";
import type { AddProductToSaleOutcome } from "./add-product-to-sale.js";
import { addProductToSale } from "./add-product-to-sale.js";
import type { RegisterRestoration } from "./register-restoration.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";

export interface AddScannedProductInput {
  actorId: string;
  code: string;
}

export interface AddScannedProductPorts {
  ledger: SaleLedger;
  restoration: RegisterRestoration;
  clock: Clock;
  ids: IdGenerator;
}

export type AddScannedProductOutcome =
  | Exclude<AddProductToSaleOutcome, { kind: "product_not_found" }>
  | { kind: "unknown_code" };

export function addScannedProduct(
  { ledger, restoration, clock, ids }: AddScannedProductPorts,
  { actorId, code }: AddScannedProductInput,
): AddScannedProductOutcome {
  const outcome = ledger.transaction((tx) =>
    addProductToSale(tx, {
      actorId,
      clock,
      ids,
      restoration,
      findProduct: () => (isBarcodeTooLong(code) ? undefined : tx.activeProductByBarcode(code)),
    }),
  );
  return outcome.kind === "product_not_found" ? { kind: "unknown_code" } : outcome;
}
