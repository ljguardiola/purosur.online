import type { WeighingReading } from "./scale.js";

export type ScaleWeighingStep =
  | { kind: "scale_unavailable" }
  | { kind: "weighing" }
  | { kind: "zero_weight" }
  | { kind: "unsteady"; weightThousandths: number }
  | { kind: "unsteady_out_of_range" }
  | { kind: "stable"; weightThousandths: number }
  | { kind: "take"; weightThousandths: number };

export function scaleWeighingStep(
  reading: WeighingReading,
  confirmedWeightThousandths: number | null,
  mayBeQuantity: (weightThousandths: number) => boolean,
): ScaleWeighingStep {
  if (reading.kind === "unavailable") {
    return { kind: "scale_unavailable" };
  }
  if (reading.kind === "not_stable") {
    return { kind: "weighing" };
  }
  const { weightThousandths } = reading;
  if (reading.kind === "unstable") {
    return weightThousandths === 0 || mayBeQuantity(weightThousandths)
      ? { kind: "unsteady", weightThousandths }
      : { kind: "unsteady_out_of_range" };
  }
  if (weightThousandths === 0) {
    return confirmedWeightThousandths === null
      ? { kind: "stable", weightThousandths }
      : { kind: "zero_weight" };
  }
  if (!mayBeQuantity(weightThousandths)) {
    return { kind: "weighing" };
  }
  return {
    kind:
      reading.kind === "stable" && weightThousandths === confirmedWeightThousandths
        ? "take"
        : "stable",
    weightThousandths,
  };
}
