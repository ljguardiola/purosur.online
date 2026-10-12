import { fiscalUnknownAlertIsDue, fiscalUnknownAlertLevel } from "../../alerts/index.js";
import type { Clock } from "../../shared/index.js";
import type { UnclearOutcomeAlertStore } from "./unclear-outcome-alert-ports.js";

export interface OpenOverdueUnclearOutcomeAlertsPorts {
  store: UnclearOutcomeAlertStore;
  clock: Clock;
}

export type OpenOverdueUnclearOutcomeAlertsOutcome = {
  kind: "opened";
  fiscalDocumentIds: string[];
};

export async function openOverdueUnclearOutcomeAlerts({
  store,
  clock,
}: OpenOverdueUnclearOutcomeAlertsPorts): Promise<OpenOverdueUnclearOutcomeAlertsOutcome> {
  return store.transaction<OpenOverdueUnclearOutcomeAlertsOutcome>(async (tx) => {
    const now = clock.now();
    const unclear = await tx.lockUnclearDocumentsWithoutUnclearOutcomeAlert();
    const overdue = unclear.filter((document) =>
      fiscalUnknownAlertIsDue(document.unclearSince, now),
    );
    for (const document of overdue) {
      await tx.openUnclearOutcomeAlert(
        document,
        fiscalUnknownAlertLevel(document.unclearSince, now),
        now,
      );
    }
    return {
      kind: "opened",
      fiscalDocumentIds: overdue.map((document) => document.fiscalDocumentId),
    };
  });
}
