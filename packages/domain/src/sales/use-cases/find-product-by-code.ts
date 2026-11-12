import { isBarcodeTooLong, type SaleUnit } from "../../catalog/index.js";
import type { RegisterRestoration } from "./register-restoration.js";
import type { SaleLedger } from "./sale-ledger.js";
import { isRefusal, type SellingSessionRefusal, sellingSession } from "./selling-session.js";

export interface FindProductByCodeInput {
  actorId: string;
  code: string;
}

export interface FindProductByCodePorts {
  ledger: SaleLedger;
  restoration: RegisterRestoration;
}

export interface ProductFoundByCode {
  productId: string;
  name: string;
  saleUnit: SaleUnit;
  unitPrice: number | null;
}

export type FindProductByCodeOutcome =
  | SellingSessionRefusal
  | { kind: "found"; product: ProductFoundByCode }
  | { kind: "unknown_code" };

export function findProductByCode(
  { ledger, restoration }: FindProductByCodePorts,
  { actorId, code }: FindProductByCodeInput,
): FindProductByCodeOutcome {
  return ledger.transaction<FindProductByCodeOutcome>((tx) => {
    const session = sellingSession(tx, actorId, restoration);
    if (isRefusal(session)) {
      return session;
    }
    const product = isBarcodeTooLong(code) ? undefined : tx.activeProductByBarcode(code);
    if (product === undefined) {
      return { kind: "unknown_code" };
    }
    return {
      kind: "found",
      product: {
        productId: product.id,
        name: product.name,
        saleUnit: product.saleUnit,
        unitPrice: tx.currentPrice(product.id)?.unitPrice ?? null,
      },
    };
  });
}
