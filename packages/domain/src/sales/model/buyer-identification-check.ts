import {
  type BuyerIdentificationThreshold,
  type ChargeRefusal,
  chargeRefusal,
} from "../../fiscal/index.js";
import { hasApprovedPayment } from "../../payments/index.js";
import type { ZoneRules } from "../../shared/index.js";

export function buyerIdentificationRefusal(
  total: number,
  payments: readonly { state: string }[],
  thresholds: readonly BuyerIdentificationThreshold[],
  moment: Date,
  rules: ZoneRules,
): ChargeRefusal | undefined {
  if (hasApprovedPayment(payments)) {
    return undefined;
  }
  return chargeRefusal(total, thresholds, moment, rules);
}
