import type { ScaleReading } from "../../shared/index.js";
import { mayBeSaleLineQuantity } from "../model/sale-line.js";

export type StableWeighing = { kind: "stable"; weightThousandths: number; amount: number };

export type ScaleWeighingStep =
  | { kind: "scale_unavailable" }
  | { kind: "weighing" }
  | { kind: "zero_weight" }
  | StableWeighing
  | { kind: "take"; weightThousandths: number };

export function scaleWeighingStep(
  reading: ScaleReading,
  confirmedWeightThousandths: number | null,
  amountAt: (weightThousandths: number) => number,
): ScaleWeighingStep {
  if (reading.kind === "unavailable") {
    return { kind: "scale_unavailable" };
  }
  if (reading.kind === "not_stable") {
    return { kind: "weighing" };
  }
  const { weightThousandths } = reading;
  if (weightThousandths === 0) {
    return confirmedWeightThousandths === null
      ? { kind: "stable", weightThousandths, amount: 0 }
      : { kind: "zero_weight" };
  }
  if (!mayBeSaleLineQuantity(weightThousandths, "KG")) {
    return { kind: "weighing" };
  }
  return weightThousandths === confirmedWeightThousandths
    ? { kind: "take", weightThousandths }
    : { kind: "stable", weightThousandths, amount: amountAt(weightThousandths) };
}
