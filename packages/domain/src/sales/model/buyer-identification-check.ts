import {
  type BuyerIdentificationThreshold,
  type ChargeRefusal,
  chargeRefusal,
} from "../../fiscal/index.js";
import { hasApprovedPayment } from "../../payments/index.js";

export function buyerIdentificationRefusal(
  total: number,
  payments: readonly { state: string }[],
  thresholds: readonly BuyerIdentificationThreshold[],
  moment: Date,
): ChargeRefusal | undefined {
  if (hasApprovedPayment(payments)) {
    return undefined;
  }
  return chargeRefusal(total, thresholds, moment);
}
