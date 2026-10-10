import { fortnightContaining, isSameFortnight } from "../model/offline-authorization-code.js";
import type { ObtainOfflineAuthorizationCodesOutcome } from "./obtain-offline-authorization-codes.js";

export type CurrentFortnightCodeStanding = "held" | "missing" | "nothing_to_obtain";

export function currentFortnightCodeAfterObtaining(
  outcome: ObtainOfflineAuthorizationCodesOutcome,
  day: string,
): CurrentFortnightCodeStanding {
  if (outcome.kind === "no_offline_point_of_sale") {
    return "nothing_to_obtain";
  }
  const current = fortnightContaining(day);
  const attempt = outcome.fortnights.find(({ fortnight }) => isSameFortnight(fortnight, current));
  switch (attempt?.outcome.kind) {
    case "obtained":
    case "recovered":
    case "held":
      return "held";
    default:
      return "missing";
  }
}
