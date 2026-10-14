import type { Fortnight, FortnightReportState } from "../../fiscal/index.js";
import type { Clock } from "../../shared/index.js";
import type { AlertConditionObservation } from "../model/alert-condition-observation.js";
import type { OpenAlertInput } from "../model/alert-details.js";

export interface OwedFortnightPresentation {
  pointOfSaleNumber: number;
  registerId: string;
  fortnight: Fortnight;
  taxAuthorityDeadline: string;
  state: FortnightReportState | null;
}

export interface OwedFortnightPresentationReader {
  owedPresentations(today: string): Promise<OwedFortnightPresentation[]>;
}

export interface FortnightReportDeadlineAlerts {
  pendingAlertScopes(): Promise<string[]>;
  observeAlertCondition(observation: AlertConditionObservation): Promise<void>;
  hasOpenedOverdueAlert(scope: string): Promise<boolean>;
  openOverdueAlert(alert: OpenAlertInput): Promise<void>;
}

export interface FortnightReportDeadlineDetectionPorts {
  presentations: OwedFortnightPresentationReader;
  alerts: FortnightReportDeadlineAlerts;
  clock: Clock;
}
