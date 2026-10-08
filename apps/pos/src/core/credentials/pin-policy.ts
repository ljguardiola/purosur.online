import type { PinPolicy } from "@purosur/contracts";
import { PIN_MIN_DIGITS } from "@purosur/domain";

export function pinPolicy(): PinPolicy {
  return { min_digits: PIN_MIN_DIGITS };
}
