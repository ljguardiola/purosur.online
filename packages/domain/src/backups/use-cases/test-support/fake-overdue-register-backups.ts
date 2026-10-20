import type { AlertConditionObservation } from "../../../alerts/index.js";
import type { RegisterBackupStanding } from "../../model/register-backup-overdue.js";
import type {
  RegisterBackupOverdueAlerts,
  RegisterBackupStandingReader,
} from "../overdue-register-backup-ports.js";

export class FakeRegisterBackupStandingReader implements RegisterBackupStandingReader {
  private readonly standings: RegisterBackupStanding[];

  constructor(standings: RegisterBackupStanding[]) {
    this.standings = structuredClone(standings);
  }

  async watchedRegisterBackupStandings(): Promise<RegisterBackupStanding[]> {
    return structuredClone(this.standings);
  }
}

export class FakeRegisterBackupOverdueAlerts implements RegisterBackupOverdueAlerts {
  readonly observations: AlertConditionObservation[] = [];

  async observeAlertCondition(observation: AlertConditionObservation): Promise<void> {
    this.observations.push(structuredClone(observation));
  }
}
