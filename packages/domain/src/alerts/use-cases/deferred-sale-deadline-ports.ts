import type { Clock } from "../../shared/index.js";
import type { AlertConditionObservation } from "../model/alert-condition-observation.js";

export interface DeferredSaleDeadlineAlerts {
  dueAlertScopes(): Promise<string[]>;
  observeAlertCondition(observation: AlertConditionObservation): Promise<void>;
}

export interface DeferredSaleDeadlineDetectionPorts {
  alerts: DeferredSaleDeadlineAlerts;
  clock: Clock;
}
