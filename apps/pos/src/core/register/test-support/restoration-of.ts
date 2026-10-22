import { restorePendingIn } from "../../backups/restore-pending";
import type { LocalDatabase } from "../../platform/local-database";
import { SqliteRestorationEvidence } from "../sqlite-restoration-evidence";

export function restorationOf(database: LocalDatabase): SqliteRestorationEvidence {
  return new SqliteRestorationEvidence(database, restorePendingIn(undefined));
}
