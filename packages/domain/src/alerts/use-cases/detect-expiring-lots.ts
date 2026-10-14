import { argentinaCalendarDay } from "../../shared/index.js";
import { canExpireWithStock, expiryWindowEnd } from "../../stock/index.js";
import {
  lotsExpiringObservation,
  lotsNoLongerExpiringObservation,
} from "../model/alert-condition-observation.js";
import type { ExpiringLotDetectionPorts } from "./expiring-lot-alert-ports.js";

export async function detectExpiringLots({
  branches,
  lots,
  alerts,
  clock,
}: ExpiringLotDetectionPorts): Promise<number> {
  const today = argentinaCalendarDay(clock.now());
  const branchesWithLots = new Set<string>();
  for (const { locationId, windowDays } of await branches.branchExpiryWindows()) {
    const candidates = await lots.lotsExpiringBy(locationId, expiryWindowEnd(today, windowDays));
    const lotCount = candidates.filter(canExpireWithStock).length;
    if (lotCount === 0) {
      continue;
    }
    branchesWithLots.add(locationId);
    await alerts.observeAlertCondition(
      lotsExpiringObservation({ locationId, lotCount, windowDays }),
    );
  }
  for (const scope of await alerts.openAlertScopes()) {
    if (!branchesWithLots.has(scope)) {
      await alerts.observeAlertCondition(lotsNoLongerExpiringObservation(scope));
    }
  }
  return branchesWithLots.size;
}
