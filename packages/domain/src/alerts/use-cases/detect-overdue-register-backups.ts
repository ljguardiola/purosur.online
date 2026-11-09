import { isRegisterBackupOverdue } from "../../backups/index.js";
import {
  registerBackedUpObservation,
  registerBackupOverdueObservation,
} from "../model/alert-condition-observation.js";
import type { OverdueRegisterBackupDetectionPorts } from "./overdue-register-backup-ports.js";

export async function detectOverdueRegisterBackups({
  standings,
  alerts,
  clock,
}: OverdueRegisterBackupDetectionPorts): Promise<number> {
  const now = clock.now();
  let overdueCount = 0;
  for (const standing of await standings.watchedRegisterBackupStandings()) {
    const { firstChangeSinceLastVerifiedAt } = standing;
    if (
      firstChangeSinceLastVerifiedAt !== null &&
      isRegisterBackupOverdue({ firstChangeSinceLastVerifiedAt, now })
    ) {
      await alerts.observeAlertCondition(
        registerBackupOverdueObservation({
          registerId: standing.registerId,
          lastVerifiedGenerationAt: standing.lastVerifiedGenerationAt,
          firstChangeAt: firstChangeSinceLastVerifiedAt,
        }),
      );
      overdueCount += 1;
    } else {
      await alerts.observeAlertCondition(registerBackedUpObservation(standing.registerId));
    }
  }
  return overdueCount;
}
