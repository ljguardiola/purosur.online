import {
  fortnightReportNoLongerOwedElsewhereObservation,
  fortnightReportOwedElsewhereObservation,
  pointOfSaleFortnightScope,
} from "../model/fortnight-report-alerts.js";
import type { OwedElsewhereDetectionPorts } from "./owed-elsewhere-presentation-ports.js";

export async function detectOwedElsewherePresentations({
  presentations,
  alerts,
}: OwedElsewhereDetectionPorts): Promise<number> {
  const owedScopes = new Set<string>();
  for (const owed of await presentations.owedElsewhere()) {
    const scope = pointOfSaleFortnightScope(owed.pointOfSaleNumber, owed.fortnight.start);
    if (owedScopes.has(scope)) {
      continue;
    }
    owedScopes.add(scope);
    await alerts.observeAlertCondition(fortnightReportOwedElsewhereObservation(owed));
  }
  for (const scope of await alerts.owedElsewhereAlertScopes()) {
    if (!owedScopes.has(scope)) {
      await alerts.observeAlertCondition(fortnightReportNoLongerOwedElsewhereObservation(scope));
    }
  }
  return owedScopes.size;
}
