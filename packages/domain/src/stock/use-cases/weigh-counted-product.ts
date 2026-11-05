import { type Scale, scaleWeighingStep } from "../../shared/index.js";
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
  | { kind: "unsteady"; weightThousandths: number }
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
  const step = scaleWeighingStep(
    await scale.read(),
    confirmedWeightThousandths,
    mayBeMovementQuantity,
  );
  switch (step.kind) {
    case "stable":
      return { kind: "weighed", weightThousandths: step.weightThousandths };
    case "take":
      return { kind: "confirmed", weightThousandths: step.weightThousandths };
    default:
      return step;
  }
}
