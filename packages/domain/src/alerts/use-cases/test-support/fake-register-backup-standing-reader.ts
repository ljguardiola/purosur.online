import type { RegisterBackupStanding } from "../../../backups/index.js";
import type { RegisterBackupStandingReader } from "../register-backup-standing-reader.js";

export class FakeRegisterBackupStandingReader implements RegisterBackupStandingReader {
  private readonly standings: RegisterBackupStanding[];

  constructor(standings: RegisterBackupStanding[]) {
    this.standings = structuredClone(standings);
  }

  async watchedRegisterBackupStandings(): Promise<RegisterBackupStanding[]> {
    return structuredClone(this.standings);
  }
}
