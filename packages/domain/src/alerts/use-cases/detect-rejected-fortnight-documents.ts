import {
  fortnightReportDocumentNoLongerRejectedObservation,
  fortnightReportDocumentRejectedObservation,
  rejectedDocumentScope,
} from "../model/fortnight-report-alerts.js";
import type { RejectedFortnightDocumentDetectionPorts } from "./rejected-fortnight-document-ports.js";

export async function detectRejectedFortnightDocuments({
  presentations,
  alerts,
}: RejectedFortnightDocumentDetectionPorts): Promise<number> {
  const rejectedScopes = new Set<string>();
  for (const rejected of await presentations.presentationsAwaitingRemedy()) {
    const scope = rejectedDocumentScope(
      rejected.pointOfSaleNumber,
      rejected.fortnight.start,
      rejected.documentType,
    );
    if (rejectedScopes.has(scope)) {
      continue;
    }
    rejectedScopes.add(scope);
    await alerts.observeAlertCondition(fortnightReportDocumentRejectedObservation(rejected));
  }
  for (const scope of await alerts.rejectedDocumentAlertScopes()) {
    if (!rejectedScopes.has(scope)) {
      await alerts.observeAlertCondition(fortnightReportDocumentNoLongerRejectedObservation(scope));
    }
  }
  return rejectedScopes.size;
}
