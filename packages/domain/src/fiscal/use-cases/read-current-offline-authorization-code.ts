import { argentinaCalendarDay } from "../../shared/index.js";
import { fortnightContaining } from "../model/offline-authorization-code.js";
import type { CurrentOfflineAuthorizationCodePorts } from "./current-offline-authorization-code-ports.js";
import type { OfflineAuthorizationCode } from "./offline-authorization-code-ports.js";

export function readCurrentOfflineAuthorizationCode({
  codes,
  clock,
  zoneRules,
}: CurrentOfflineAuthorizationCodePorts): Promise<OfflineAuthorizationCode | null> {
  const today = argentinaCalendarDay(clock.now(), zoneRules.zoneRules());
  return codes.heldCodeOf(fortnightContaining(today));
}
