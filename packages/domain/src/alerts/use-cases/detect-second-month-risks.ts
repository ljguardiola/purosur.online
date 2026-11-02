import {
  contingencyTimeMeasurement,
  monthAtRiskOfSecondConsecutiveBreach,
  monthWindow,
  nonCompliantMeasurementsOfMonth,
} from "../../fiscal/index.js";
import { argentinaCalendarDay } from "../../shared/index.js";
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
  const now = clock.now();
  const today = argentinaCalendarDay(now, zoneRules.zoneRules());
  const { month, previousMonth } = monthAtRiskOfSecondConsecutiveBreach(today);
  const previousWindow = monthWindow(previousMonth, zoneRules.zoneRules());
  const currentWindow = monthWindow(month, zoneRules.zoneRules());
  const recorded = new Set(
    (await risks.addressesWithRecordedBreach(previousMonth)).map((each) => each.fiscalAddressId),
  );
  const counts = await risks.runningCounts(month);
  const previousRuns = await risks.availabilityRuns({
    from: previousWindow.start,
    to: previousWindow.end,
  });
  const currentRuns = await risks.availabilityRuns({
    from: currentWindow.start,
    to: currentWindow.end,
  });
  const observedScopes = new Set<string>();
  for (const address of await risks.fiscalAddresses()) {
    const previousContingency = await risks.contingencyIntervalsAtFiscalAddress({
      fiscalAddressId: address.fiscalAddressId,
      from: previousWindow.start,
      to: previousWindow.end,
    });
    const previousMonthNonCompliantOn = nonCompliantMeasurementsOfMonth({
      exceptionShareRecorded: recorded.has(address.fiscalAddressId),
      contingencyTime: contingencyTimeMeasurement({
        window: previousWindow,
        now,
        closed: true,
        runs: previousRuns,
        ...previousContingency,
      }),
    });
    if (previousMonthNonCompliantOn.length === 0) {
      continue;
    }
    observedScopes.add(fiscalAddressMonthScope(address.fiscalAddressId, month));
    const running = counts.find((each) => each.fiscalAddressId === address.fiscalAddressId);
    const { shareTenthsOfPercent } = contingencyTimeMeasurement({
      window: currentWindow,
      now,
      closed: false,
      runs: currentRuns,
      ...(await risks.contingencyIntervalsAtFiscalAddress({
        fiscalAddressId: address.fiscalAddressId,
        from: currentWindow.start,
        to: currentWindow.end,
      })),
    });
    await alerts.observeAlertCondition(
      secondMonthAtRiskObservation(
        address,
        month,
        previousMonth,
        {
          exceptionCount: running?.exceptionCount ?? 0,
          totalCount: running?.totalCount ?? 0,
        },
        { previousMonthNonCompliantOn, contingencyShareTenthsOfPercent: shareTenthsOfPercent },
      ),
    );
  }
  for (const scope of await alerts.atRiskAlertScopes()) {
    if (!observedScopes.has(scope)) {
      await alerts.observeAlertCondition(secondMonthNoLongerAtRiskObservation(scope));
    }
  }
  return observedScopes.size;
}
