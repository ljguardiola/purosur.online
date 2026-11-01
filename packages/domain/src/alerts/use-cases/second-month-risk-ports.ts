import type { ExceptionShareCounts } from "../../fiscal/index.js";
import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import type { AlertConditionObservation } from "../model/alert-condition-observation.js";

export interface SecondMonthRiskAddress {
  fiscalAddressId: string;
  fiscalAddressName: string;
}

export interface RunningExceptionShareCounts extends ExceptionShareCounts {
  fiscalAddressId: string;
}

export interface SecondMonthRiskReader {
  addressesWithRecordedBreach(month: string): Promise<SecondMonthRiskAddress[]>;
  runningCounts(month: string): Promise<RunningExceptionShareCounts[]>;
}

export interface SecondMonthRiskAlerts {
  atRiskAlertScopes(): Promise<string[]>;
  observeAlertCondition(observation: AlertConditionObservation): Promise<void>;
}

export interface SecondMonthRiskDetectionPorts {
  risks: SecondMonthRiskReader;
  alerts: SecondMonthRiskAlerts;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}
