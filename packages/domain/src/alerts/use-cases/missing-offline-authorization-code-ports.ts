import type { Clock } from "../../shared/index.js";
import type { AlertConditionObservation } from "../model/alert-condition-observation.js";
import type { OfflineAuthorizationCodeHoldingReader } from "./offline-authorization-code-holding-reader.js";

export interface MissingOfflineAuthorizationCodeAlerts {
  openAlertScopes(): Promise<string[]>;
  observeAlertCondition(observation: AlertConditionObservation): Promise<void>;
}

export interface MissingOfflineAuthorizationCodeDetectionPorts {
  holdings: OfflineAuthorizationCodeHoldingReader;
  alerts: MissingOfflineAuthorizationCodeAlerts;
  clock: Clock;
}
