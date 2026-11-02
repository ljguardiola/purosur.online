import type {
  ArcaAvailabilityRun,
  ContingencyPart,
  ContingencyReportingRegister,
  ExceptionShareCounts,
} from "../../fiscal/index.js";
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
  fiscalAddressesWithRecordedBreach(month: string): Promise<string[]>;
  runningCounts(month: string): Promise<RunningExceptionShareCounts[]>;
  fiscalAddresses(): Promise<SecondMonthRiskAddress[]>;
  availabilityRuns(window: { from: Date; to: Date }): Promise<ArcaAvailabilityRun[]>;
  contingencyIntervalsAtFiscalAddress(query: {
    fiscalAddressId: string;
    from: Date;
    to: Date;
  }): Promise<{ parts: ContingencyPart[]; registers: ContingencyReportingRegister[] }>;
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
