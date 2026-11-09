import type { RegisterBackupStanding } from "../../backups/index.js";
import type { Clock } from "../../shared/index.js";
import type { AlertConditionObservation } from "../model/alert-condition-observation.js";

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
