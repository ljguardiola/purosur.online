import type { AlertConditionObservation } from "../../alerts/index.js";
import type { Clock } from "../../shared/index.js";
import type { RegisterBackupStanding } from "../model/register-backup-overdue.js";

export interface RegisterBackupStandingReader {
  watchedRegisterBackupStandings(): Promise<RegisterBackupStanding[]>;
}

export interface RegisterBackupOverdueAlerts {
  observeAlertCondition(observation: AlertConditionObservation): Promise<void>;
}

export interface OverdueRegisterBackupDetectionPorts {
  standings: RegisterBackupStandingReader;
  alerts: RegisterBackupOverdueAlerts;
  clock: Clock;
}
