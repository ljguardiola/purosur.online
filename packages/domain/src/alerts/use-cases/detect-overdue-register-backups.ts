import { isRegisterBackupOverdue } from "../../backups/index.js";
import {
  registerBackedUpObservation,
  registerBackupOverdueObservation,
} from "../model/alert-condition-observation.js";
import type { AlertClosingPorts } from "./alert-store.js";
import { observeAlertCondition } from "./observe-alert-condition.js";
import type { RegisterBackupStandingReader } from "./register-backup-standing-reader.js";

export interface OverdueRegisterBackupDetectionPorts extends AlertClosingPorts {
  standings: RegisterBackupStandingReader;
}

export async function detectOverdueRegisterBackups(
  ports: OverdueRegisterBackupDetectionPorts,
): Promise<number> {
  const now = ports.clock.now();
  const standings = await ports.standings.watchedRegisterBackupStandings();
  let overdueCount = 0;
  for (const standing of standings) {
    const { firstChangeSinceLastVerifiedAt } = standing;
    if (
      firstChangeSinceLastVerifiedAt !== null &&
      isRegisterBackupOverdue({ firstChangeSinceLastVerifiedAt, now })
    ) {
      await observeAlertCondition(
        ports,
        registerBackupOverdueObservation({
          registerId: standing.registerId,
          lastVerifiedGenerationAt: standing.lastVerifiedGenerationAt,
          firstChangeAt: firstChangeSinceLastVerifiedAt,
        }),
      );
      overdueCount += 1;
    } else {
      await observeAlertCondition(ports, registerBackedUpObservation(standing.registerId));
    }
  }
  return overdueCount;
}
