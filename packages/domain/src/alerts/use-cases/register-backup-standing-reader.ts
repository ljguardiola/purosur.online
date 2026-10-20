import type { RegisterBackupStanding } from "../../backups/index.js";

export interface RegisterBackupStandingReader {
  watchedRegisterBackupStandings(): Promise<RegisterBackupStanding[]>;
}
