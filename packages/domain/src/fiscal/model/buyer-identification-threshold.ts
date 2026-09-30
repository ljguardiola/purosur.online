export interface BuyerIdentificationThreshold {
  id: string;
  amount: number;
  validFrom: string;
}

export function isBuyerIdentificationThresholdAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount > 0;
}

// ISO calendar days order the same way as text.
export function startsAfterLatestThreshold(
  validFrom: string,
  latest: Pick<BuyerIdentificationThreshold, "validFrom"> | undefined,
): boolean {
  return latest === undefined || validFrom > latest.validFrom;
}

export function thresholdInEffectOn(
  thresholds: readonly BuyerIdentificationThreshold[],
  day: string,
): BuyerIdentificationThreshold | undefined {
  const started = thresholds.filter((threshold) => threshold.validFrom <= day);
  return started.find((threshold) =>
    started.every((other) => other.validFrom <= threshold.validFrom),
  );
}

export function thresholdScheduledAfter(
  thresholds: readonly BuyerIdentificationThreshold[],
  day: string,
): BuyerIdentificationThreshold | undefined {
  const scheduled = thresholds.filter((threshold) => threshold.validFrom > day);
  return scheduled.find((threshold) =>
    scheduled.every((other) => other.validFrom >= threshold.validFrom),
  );
}
