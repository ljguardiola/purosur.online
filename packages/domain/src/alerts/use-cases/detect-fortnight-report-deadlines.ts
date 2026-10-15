import { fortnightReportDeadline, fortnightReportStanding } from "../../fiscal/index.js";
import { argentinaCalendarDay } from "../../shared/index.js";
import {
  fortnightReportNoLongerPendingObservation,
  fortnightReportOverdueAlert,
  fortnightReportPendingObservation,
  pointOfSaleFortnightScope,
} from "../model/fortnight-report-alerts.js";
import type { FortnightReportDeadlineDetectionPorts } from "./fortnight-report-deadline-ports.js";

export async function detectFortnightReportDeadlines({
  presentations,
  alerts,
  clock,
}: FortnightReportDeadlineDetectionPorts): Promise<number> {
  const today = argentinaCalendarDay(clock.now());
  const pendingScopes = new Set<string>();
  for (const owed of await presentations.owedPresentations(today)) {
    const { pointOfSaleNumber, registerId, fortnight, state } = owed;
    const deadline = fortnightReportDeadline(fortnight, owed.taxAuthorityDeadline);
    const standing = fortnightReportStanding({ fortnight, deadline, state }, today);
    const scope = pointOfSaleFortnightScope(pointOfSaleNumber, fortnight.start);
    if (standing.kind === "pending") {
      pendingScopes.add(scope);
      await alerts.observeAlertCondition(
        fortnightReportPendingObservation({
          pointOfSaleNumber,
          registerId,
          fortnight,
          deadline,
          daysLeft: standing.daysLeft,
          pressing: standing.pressing,
          state,
        }),
      );
    } else if (standing.kind === "missed" && !(await alerts.hasOpenedOverdueAlert(scope))) {
      await alerts.openOverdueAlert(
        fortnightReportOverdueAlert({ pointOfSaleNumber, registerId, fortnight, deadline }),
      );
    }
  }
  for (const scope of await alerts.pendingAlertScopes()) {
    if (!pendingScopes.has(scope)) {
      await alerts.observeAlertCondition(fortnightReportNoLongerPendingObservation(scope));
    }
  }
  return pendingScopes.size;
}
