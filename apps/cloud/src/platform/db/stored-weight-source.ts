import { WEIGHT_SOURCES, type WeightSource } from "@purosur/domain";

export function storedWeightSource(stored: string | null): WeightSource | null {
  if (stored === null) {
    return null;
  }
  const weightSource = WEIGHT_SOURCES.find((known) => known === stored);
  if (weightSource === undefined) {
    throw new Error(`A stored sale line has an unknown weight source: ${stored}`);
  }
  return weightSource;
}
