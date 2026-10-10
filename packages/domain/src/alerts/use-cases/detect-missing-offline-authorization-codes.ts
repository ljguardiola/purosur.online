import { fortnightsWithinRequestWindowOn } from "../../fiscal/index.js";
import { argentinaCalendarDay } from "../../shared/index.js";
import {
  offlineAuthorizationCodeHeldObservation,
  offlineAuthorizationCodeMissingObservation,
} from "../model/alert-condition-observation.js";
import { offlineAuthorizationCodeAcquisitionLevel } from "../model/offline-authorization-code-acquisition.js";
import { registerFortnightScope } from "../model/register-fortnight-scope.js";
import type { AlertClosingPorts } from "./alert-store.js";
import { observeAlertCondition } from "./observe-alert-condition.js";
import type { OfflineAuthorizationCodeHoldingReader } from "./offline-authorization-code-holding-reader.js";

export interface MissingOfflineAuthorizationCodeDetectionPorts extends AlertClosingPorts {
  holdings: OfflineAuthorizationCodeHoldingReader;
}

export async function detectMissingOfflineAuthorizationCodes(
  ports: MissingOfflineAuthorizationCodeDetectionPorts,
): Promise<number> {
  const day = argentinaCalendarDay(ports.clock.now());
  const fortnights = fortnightsWithinRequestWindowOn(day);
  const registers = await ports.holdings.watchedRegisterHoldings(fortnights);
  const holdingScopes = new Set<string>();
  for (const register of registers) {
    for (const fortnight of fortnights) {
      const level = offlineAuthorizationCodeAcquisitionLevel(fortnight, day);
      if (level === null || register.heldFortnightStarts.includes(fortnight.start)) {
        continue;
      }
      const observation = offlineAuthorizationCodeMissingObservation({
        registerId: register.registerId,
        deviceId: register.deviceId,
        fortnight,
        level,
      });
      holdingScopes.add(registerFortnightScope(register.registerId, fortnight.start));
      await observeAlertCondition(ports, observation);
    }
  }
  for (const scope of await ports.holdings.scopesOfOpenMissingCodeAlerts()) {
    if (!holdingScopes.has(scope)) {
      await observeAlertCondition(ports, offlineAuthorizationCodeHeldObservation(scope));
    }
  }
  return holdingScopes.size;
}
