import { monthOfDay } from "../../fiscal/index.js";
import { addCalendarMonths, argentinaCalendarDay } from "../../shared/index.js";
import { fiscalAddressMonthScope } from "../model/exception-share-alerts.js";
import {
  secondMonthAtRiskObservation,
  secondMonthNoLongerAtRiskObservation,
} from "../model/second-month-at-risk-alert.js";
import type { SecondMonthRiskDetectionPorts } from "./second-month-risk-ports.js";

export async function detectSecondNonCompliantMonthRisks({
  risks,
  alerts,
  clock,
  zoneRules,
}: SecondMonthRiskDetectionPorts): Promise<number> {
  const today = argentinaCalendarDay(clock.now(), zoneRules.zoneRules());
  const month = monthOfDay(today);
  const previousMonth = monthOfDay(addCalendarMonths(today, -1));
  const addresses = await risks.addressesWithRecordedBreach(previousMonth);
  const counts = await risks.runningCounts(month);
  const observedScopes = new Set<string>();
  for (const address of addresses) {
    observedScopes.add(fiscalAddressMonthScope(address.fiscalAddressId, month));
    const running = counts.find((each) => each.fiscalAddressId === address.fiscalAddressId);
    await alerts.observeAlertCondition(
      secondMonthAtRiskObservation(address, month, previousMonth, {
        exceptionCount: running?.exceptionCount ?? 0,
        totalCount: running?.totalCount ?? 0,
      }),
    );
  }
  for (const scope of await alerts.atRiskAlertScopes()) {
    if (!observedScopes.has(scope)) {
      await alerts.observeAlertCondition(secondMonthNoLongerAtRiskObservation(scope));
    }
  }
  return observedScopes.size;
}
