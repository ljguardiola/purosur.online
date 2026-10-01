import { argentinaCalendarDay } from "../../shared/index.js";

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

export function latestThreshold(
  thresholds: readonly BuyerIdentificationThreshold[],
): BuyerIdentificationThreshold | undefined {
  return thresholds.find((threshold) =>
    thresholds.every((other) => other.validFrom <= threshold.validFrom),
  );
}

export type ChargeRefusal =
  | { kind: "reaches_buyer_identification_threshold"; threshold: number }
  | { kind: "no_buyer_identification_threshold" };

export function chargeRefusal(
  amount: number,
  thresholds: readonly BuyerIdentificationThreshold[],
  moment: Date,
): ChargeRefusal | undefined {
  const inEffect = thresholdInEffectOn(thresholds, argentinaCalendarDay(moment));
  if (inEffect === undefined) {
    return { kind: "no_buyer_identification_threshold" };
  }
  return amount >= inEffect.amount
    ? { kind: "reaches_buyer_identification_threshold", threshold: inEffect.amount }
    : undefined;
}
