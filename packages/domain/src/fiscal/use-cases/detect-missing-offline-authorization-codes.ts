import {
  offlineAuthorizationCodeAcquisitionLevel,
  offlineAuthorizationCodeHeldObservation,
  offlineAuthorizationCodeMissingObservation,
  registerFortnightScope,
} from "../../alerts/index.js";
import { argentinaCalendarDay } from "../../shared/index.js";
import { fortnightsWithinRequestWindowOn } from "../model/offline-authorization-code.js";
import type { MissingOfflineAuthorizationCodeDetectionPorts } from "./missing-offline-authorization-code-ports.js";

export async function detectMissingOfflineAuthorizationCodes({
  holdings,
  alerts,
  clock,
}: MissingOfflineAuthorizationCodeDetectionPorts): Promise<number> {
  const day = argentinaCalendarDay(clock.now());
  const fortnights = fortnightsWithinRequestWindowOn(day);
  const registers = await holdings.registerHoldings(fortnights);
  const missingScopes = new Set<string>();
  for (const register of registers) {
    for (const fortnight of fortnights) {
      const level = offlineAuthorizationCodeAcquisitionLevel(fortnight, day);
      if (level === null || register.heldFortnightStarts.includes(fortnight.start)) {
        continue;
      }
      missingScopes.add(registerFortnightScope(register.registerId, fortnight.start));
      await alerts.observeAlertCondition(
        offlineAuthorizationCodeMissingObservation({
          registerId: register.registerId,
          deviceId: register.deviceId,
          fortnight,
          level,
        }),
      );
    }
  }
  for (const scope of await alerts.openAlertScopes()) {
    if (!missingScopes.has(scope)) {
      await alerts.observeAlertCondition(offlineAuthorizationCodeHeldObservation(scope));
    }
  }
  return missingScopes.size;
}
