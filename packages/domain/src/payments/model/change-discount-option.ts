import { amountToChargeInCash } from "./cash-charge.js";

const CHANGE_DISCOUNT_STEP = 100_000;

export function changeDiscountOption(amountDue: number): number | null {
  const toCharge = amountToChargeInCash(amountDue);
  const option = toCharge % CHANGE_DISCOUNT_STEP;
  return option > 0 && option < toCharge ? option : null;
}
