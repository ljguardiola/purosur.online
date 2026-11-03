import type { Scale } from "../../shared/index.js";
import { mayBeMovementQuantity } from "../model/stock-quantity.js";
import { type InitialCountRefusal, initialCountRefusal } from "./initial-count-access.js";
import type { InitialCountLedger } from "./initial-count-ledger.js";

export interface WeighCountedProductInput {
  actorId: string;
  productId: string;
  confirmedWeightThousandths: number | null;
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
  | { kind: "zero_weight" }
  | { kind: "scale_unavailable" }
  | { kind: "weighed"; weightThousandths: number }
  | { kind: "confirmed"; weightThousandths: number };

export async function weighCountedProduct(
  { ledger, scale }: WeighCountedProductPorts,
  { actorId, productId, confirmedWeightThousandths }: WeighCountedProductInput,
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
  if (reading.kind === "not_stable") {
    return { kind: "weighing" };
  }
  const { weightThousandths } = reading;
  if (weightThousandths === 0) {
    return { kind: "zero_weight" };
  }
  if (!mayBeMovementQuantity(weightThousandths)) {
    return { kind: "weighing" };
  }
  return {
    kind: weightThousandths === confirmedWeightThousandths ? "confirmed" : "weighed",
    weightThousandths,
  };
}
