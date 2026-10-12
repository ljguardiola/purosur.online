import type { Fortnight } from "../../fiscal/index.js";
import type { Clock } from "../../shared/index.js";
import type { AlertConditionObservation } from "../model/alert-condition-observation.js";

export interface RegisterOfflineAuthorizationCodeHolding {
  registerId: string;
  deviceId: string;
  heldFortnightStarts: readonly string[];
}

export interface OfflineAuthorizationCodeHoldingReader {
  registerHoldings(
    fortnights: readonly Fortnight[],
  ): Promise<RegisterOfflineAuthorizationCodeHolding[]>;
}

export interface MissingOfflineAuthorizationCodeAlerts {
  openAlertScopes(): Promise<string[]>;
  observeAlertCondition(observation: AlertConditionObservation): Promise<void>;
}

export interface MissingOfflineAuthorizationCodeDetectionPorts {
  holdings: OfflineAuthorizationCodeHoldingReader;
  alerts: MissingOfflineAuthorizationCodeAlerts;
  clock: Clock;
}
