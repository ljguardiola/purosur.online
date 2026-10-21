import {
  type FiscalDocumentType,
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
  if (fortnightStart === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(fortnightStart)) {
    return scope;
  }
  const [pointOfSale, start, ...rest] = scope.split(":");
  return [pointOfSale, start, fortnightContaining(fortnightStart).end, ...rest].join(":");
}

export function rejectedDocumentScope(
  pointOfSaleNumber: number,
  fortnightStart: string,
  documentType: FiscalDocumentType,
): string {
  return `${pointOfSaleFortnightScope(pointOfSaleNumber, fortnightStart)}:${documentType}`;
}

export function fortnightReportPendingReason(
  state: FortnightReportState | null,
): FortnightReportPendingReason {
  return state === "blocked" || state === "missing_document" || state === "refused"
    ? state
    : "pending";
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
    level:
      pressing || reason === "blocked" || reason === "missing_document" ? "critical" : "warning",
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

export function fortnightReportOwedElsewhereObservation({
  pointOfSaleNumber,
  fortnight,
}: {
  pointOfSaleNumber: number;
  fortnight: Fortnight;
}): AlertConditionObservation {
  return {
    holds: true,
    alert: {
      kind: "fortnight_report_owed_elsewhere",
      scope: pointOfSaleFortnightScope(pointOfSaleNumber, fortnight.start),
      detail: { pointOfSaleNumber, fortnightStart: fortnight.start, fortnightEnd: fortnight.end },
    },
  };
}

export function fortnightReportNoLongerOwedElsewhereObservation(
  scope: string,
): AlertConditionObservation {
  return { holds: false, kind: "fortnight_report_owed_elsewhere", scope };
}

export function fortnightReportNeedsRegularizationAlert({
  pointOfSaleNumber,
  registerId,
  fortnight,
}: Omit<FortnightReportPresentation, "deadline">): OpenAlertInput {
  return {
    kind: "fortnight_report_needs_regularization",
    scope: pointOfSaleFortnightScope(pointOfSaleNumber, fortnight.start),
    detail: {
      pointOfSaleNumber,
      registerId,
      fortnightStart: fortnight.start,
      fortnightEnd: fortnight.end,
    },
  };
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

export function fortnightReportDocumentRejectedObservation({
  pointOfSaleNumber,
  registerId,
  fortnight,
  documentType,
  rejectedNumber,
}: {
  pointOfSaleNumber: number;
  registerId: string;
  fortnight: Fortnight;
  documentType: FiscalDocumentType;
  rejectedNumber: number;
}): AlertConditionObservation {
  return {
    holds: true,
    alert: {
      kind: "fortnight_report_document_rejected",
      scope: rejectedDocumentScope(pointOfSaleNumber, fortnight.start, documentType),
      detail: {
        pointOfSaleNumber,
        registerId,
        fortnightStart: fortnight.start,
        fortnightEnd: fortnight.end,
        documentType,
        rejectedNumber,
      },
    },
  };
}

export function fortnightReportDocumentNoLongerRejectedObservation(
  scope: string,
): AlertConditionObservation {
  return { holds: false, kind: "fortnight_report_document_rejected", scope };
}
