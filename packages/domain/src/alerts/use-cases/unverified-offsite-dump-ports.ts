import type { OffsiteDumpCheckResult } from "../../backups/index.js";
import type { Clock } from "../../shared/index.js";
import type { AlertConditionObservation } from "../model/alert-condition-observation.js";

export interface OffsiteDumpCheckReader {
  offsiteDumpCheckOf(night: string): Promise<OffsiteDumpCheckResult | undefined>;
}

export interface OffsiteDumpAlerts {
  observeAlertCondition(observation: AlertConditionObservation): Promise<void>;
}

export interface UnverifiedOffsiteDumpDetectionPorts {
  checks: OffsiteDumpCheckReader;
  alerts: OffsiteDumpAlerts;
  clock: Clock;
}
