import type { Scale } from "../../shared/index.js";
import { mayBeMovementQuantity } from "../model/stock-quantity.js";
import { type InitialCountRefusal, initialCountRefusal } from "./initial-count-access.js";
import type { InitialCountLedger } from "./initial-count-ledger.js";

export interface WeighCountedProductInput {
  actorId: string;
  productId: string;
}

export interface WeighCountedProductPorts {
  ledger: InitialCountLedger;
  scale: Scale;
}

export type WeighCountedProductOutcome =
  | InitialCountRefusal
  | { kind: "unknown_product" }
  | { kind: "not_sold_by_weight" }
  | { kind: "weighing" }
  | { kind: "scale_unavailable" }
  | { kind: "weighed"; weightThousandths: number };

export async function weighCountedProduct(
  { ledger, scale }: WeighCountedProductPorts,
  { actorId, productId }: WeighCountedProductInput,
): Promise<WeighCountedProductOutcome> {
  const refusal = ledger.transaction<WeighCountedProductOutcome | undefined>((tx) => {
    const notAllowed = initialCountRefusal(tx, actorId);
    if (notAllowed) {
      return notAllowed;
    }
    const product = tx.activeProductById(productId);
    if (!product) {
      return { kind: "unknown_product" };
    }
    return product.saleUnit === "KG" ? undefined : { kind: "not_sold_by_weight" };
  });
  if (refusal) {
    return refusal;
  }
  const reading = await scale.read();
  if (reading.kind === "unavailable") {
    return { kind: "scale_unavailable" };
  }
  if (reading.kind === "not_stable" || !mayBeMovementQuantity(reading.weightThousandths)) {
    return { kind: "weighing" };
  }
  return { kind: "weighed", weightThousandths: reading.weightThousandths };
}
