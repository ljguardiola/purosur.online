import { argentinaCalendarDay } from "../../shared/index.js";

export interface BuyerIdentificationThreshold {
  id: string;
  amount: number;
  validFrom: string;
  revision: number;
}

export function isBuyerIdentificationThresholdAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount > 0;
}

export function earliestThresholdStartDay(today: string): string {
  return today;
}

// ISO calendar days order the same way as text.
export function startsFromToday(validFrom: string, today: string): boolean {
  return validFrom >= earliestThresholdStartDay(today);
}

export function isLowerThanInEffect(
  amount: number,
  inEffect: Pick<BuyerIdentificationThreshold, "amount"> | undefined,
): boolean {
  return inEffect !== undefined && amount < inEffect.amount;
}

function supersedes(
  threshold: BuyerIdentificationThreshold,
  other: BuyerIdentificationThreshold,
): boolean {
  return (
    threshold.validFrom > other.validFrom ||
    (threshold.validFrom === other.validFrom && threshold.revision > other.revision)
  );
}

export function thresholdInEffectOn(
  thresholds: readonly BuyerIdentificationThreshold[],
  day: string,
): BuyerIdentificationThreshold | undefined {
  return thresholds
    .filter((threshold) => threshold.validFrom <= day)
    .reduce<BuyerIdentificationThreshold | undefined>(
      (best, threshold) => (best === undefined || supersedes(threshold, best) ? threshold : best),
      undefined,
    );
}

function startsBefore(
  threshold: BuyerIdentificationThreshold,
  other: BuyerIdentificationThreshold,
): boolean {
  return (
    threshold.validFrom < other.validFrom ||
    (threshold.validFrom === other.validFrom && threshold.revision > other.revision)
  );
}

export function thresholdScheduledAfter(
  thresholds: readonly BuyerIdentificationThreshold[],
  day: string,
): BuyerIdentificationThreshold | undefined {
  return thresholds
    .filter((threshold) => threshold.validFrom > day)
    .reduce<BuyerIdentificationThreshold | undefined>(
      (next, threshold) => (next === undefined || startsBefore(threshold, next) ? threshold : next),
      undefined,
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
