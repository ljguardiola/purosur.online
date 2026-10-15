import {
  type Fortnight,
  type FortnightReportState,
  fortnightContaining,
} from "../../fiscal/index.js";
import type { AlertConditionObservation } from "./alert-condition-observation.js";
import type { FortnightReportPendingReason, OpenAlertInput } from "./alert-details.js";

interface FortnightReportPresentation {
  pointOfSaleNumber: number;
  registerId: string;
  fortnight: Fortnight;
  deadline: string;
}

export function pointOfSaleFortnightScope(
  pointOfSaleNumber: number,
  fortnightStart: string,
): string {
  return `${pointOfSaleNumber}:${fortnightStart}`;
}

export function pointOfSaleFortnightScopeDisplay(scope: string): string {
  const fortnightStart = scope.split(":")[1];
  return fortnightStart !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(fortnightStart)
    ? `${scope}:${fortnightContaining(fortnightStart).end}`
    : scope;
}

export function fortnightReportPendingReason(
  state: FortnightReportState | null,
): FortnightReportPendingReason {
  return state === "blocked" || state === "refused" ? state : "pending";
}

function presentationDetail({
  pointOfSaleNumber,
  registerId,
  fortnight,
  deadline,
}: FortnightReportPresentation) {
  return {
    pointOfSaleNumber,
    registerId,
    fortnightStart: fortnight.start,
    fortnightEnd: fortnight.end,
    deadline,
  };
}

export function fortnightReportPendingObservation({
  daysLeft,
  pressing,
  state,
  ...presentation
}: FortnightReportPresentation & {
  daysLeft: number;
  pressing: boolean;
  state: FortnightReportState | null;
}): AlertConditionObservation {
  const reason = fortnightReportPendingReason(state);
  return {
    holds: true,
    level: pressing || reason === "blocked" ? "critical" : "warning",
    alert: {
      kind: "fortnight_report_pending",
      scope: pointOfSaleFortnightScope(
        presentation.pointOfSaleNumber,
        presentation.fortnight.start,
      ),
      detail: { ...presentationDetail(presentation), daysLeft, reason },
    },
  };
}

export function fortnightReportNoLongerPendingObservation(
  scope: string,
): AlertConditionObservation {
  return { holds: false, kind: "fortnight_report_pending", scope };
}

export function fortnightReportOverdueAlert(
  presentation: FortnightReportPresentation,
): OpenAlertInput {
  return {
    kind: "fortnight_report_overdue",
    scope: pointOfSaleFortnightScope(presentation.pointOfSaleNumber, presentation.fortnight.start),
    detail: presentationDetail(presentation),
  };
}
