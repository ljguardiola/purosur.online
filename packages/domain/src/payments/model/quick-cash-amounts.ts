import { isValidCashAmount } from "../../shared/index.js";
import { amountToChargeInCash } from "./cash-charge.js";

const QUICK_CASH_AMOUNT_STEPS = [100_000, 1_000_000, 2_000_000] as const;

function leastMultipleCovering(amount: number, step: number): number {
  return Math.ceil(amount / step) * step;
}

export function quickCashAmounts(amountDue: number): number[] {
  const toCharge = amountToChargeInCash(amountDue);
  const amounts = [toCharge];
  for (const step of QUICK_CASH_AMOUNT_STEPS) {
    const multiple = leastMultipleCovering(toCharge, step);
    if (!amounts.includes(multiple) && isValidCashAmount(multiple)) {
      amounts.push(multiple);
    }
  }
  return amounts;
}
