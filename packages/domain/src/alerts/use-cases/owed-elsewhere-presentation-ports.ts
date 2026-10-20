import type { ListedOwedPresentation } from "../../fiscal/index.js";
import type { AlertConditionObservation } from "../model/alert-condition-observation.js";

export interface OwedElsewherePresentationReader {
  owedElsewhere(): Promise<ListedOwedPresentation[]>;
}

export interface OwedElsewhereAlerts {
  owedElsewhereAlertScopes(): Promise<string[]>;
  observeAlertCondition(observation: AlertConditionObservation): Promise<void>;
}

export interface OwedElsewhereDetectionPorts {
  presentations: OwedElsewherePresentationReader;
  alerts: OwedElsewhereAlerts;
}
