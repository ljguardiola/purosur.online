import type { RecordedExceptionShareBreach } from "../../fiscal/index.js";
import type { OpenAlertInput } from "../model/alert-details.js";

export interface RecordedExceptionShareBreachReader {
  recordedBreaches(): Promise<RecordedExceptionShareBreach[]>;
}

export interface ExceptionShareBreachAlerts {
  hasOpenedBreachAlert(scope: string): Promise<boolean>;
  openBreachAlert(alert: OpenAlertInput): Promise<void>;
}

export interface ExceptionShareBreachDetectionPorts {
  breaches: RecordedExceptionShareBreachReader;
  alerts: ExceptionShareBreachAlerts;
}
