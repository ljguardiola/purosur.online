import {
  type ScaleReading,
  type ScaleWeighingStep,
  scaleWeighingStep,
} from "../../shared/index.js";
import { mayBeSaleLineQuantity } from "../model/sale-line.js";

export type StableWeighing = { kind: "stable"; weightThousandths: number; amount: number };

export type UnsteadyWeighing = { kind: "unsteady"; weightThousandths: number; amount: number };

export type PricedWeighingStep =
  | Exclude<ScaleWeighingStep, { kind: "stable" | "unsteady" }>
  | StableWeighing
  | UnsteadyWeighing;

export function pricedWeighingStep(
  reading: ScaleReading,
  confirmedWeightThousandths: number | null,
  amountAt: (weightThousandths: number) => number,
): PricedWeighingStep {
  const step = scaleWeighingStep(reading, confirmedWeightThousandths, (weightThousandths) =>
    mayBeSaleLineQuantity(weightThousandths, "KG"),
  );
  if (step.kind !== "stable" && step.kind !== "unsteady") {
    return step;
  }
  const { kind, weightThousandths } = step;
  return {
    kind,
    weightThousandths,
    amount: weightThousandths === 0 ? 0 : amountAt(weightThousandths),
  };
}
