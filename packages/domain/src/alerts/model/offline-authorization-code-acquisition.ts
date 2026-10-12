import type { Fortnight } from "../../fiscal/index.js";
import {
  type OfflineAuthorizationCodeAcquisitionUrgency,
  offlineAuthorizationCodeAcquisitionUrgency,
} from "../../fiscal/index.js";
import type { AlertLevel } from "./alert-catalog.js";

const LEVEL_OF_URGENCY: Record<OfflineAuthorizationCodeAcquisitionUrgency, AlertLevel> = {
  early: "informational",
  due: "warning",
  pressing: "critical",
};

export function offlineAuthorizationCodeAcquisitionLevel(
  fortnight: Fortnight,
  day: string,
): AlertLevel | null {
  const urgency = offlineAuthorizationCodeAcquisitionUrgency(fortnight, day);
  return urgency === null ? null : LEVEL_OF_URGENCY[urgency];
}
