import type { TaxAuthorityClockFloor } from "../model/clock-correction.js";
import type { RegisterClockGuardReader } from "./register-clock-guard-ports.js";

export function taxAuthorityClockFloor(
  source: Pick<RegisterClockGuardReader, "taxAuthorityFloor" | "clockCorrectionsOf">,
): TaxAuthorityClockFloor | null {
  const floor = source.taxAuthorityFloor();
  return floor === null
    ? null
    : {
        ...floor,
        corrections: source.clockCorrectionsOf(floor.pointOfSale, floor.documentType),
      };
}
