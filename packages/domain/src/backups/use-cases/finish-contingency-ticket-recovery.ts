import type { ContingencyTicketRecoveryPorts } from "./contingency-ticket-recovery-ports.js";

export interface FinishContingencyTicketRecoveryInput {
  recoveryId: string;
  finishedBy: string;
}

export type FinishContingencyTicketRecoveryOutcome =
  | { kind: "finished" }
  | { kind: "already_finished" }
  | { kind: "not_found" };

export async function finishContingencyTicketRecovery(
  { recoveries, clock }: ContingencyTicketRecoveryPorts,
  { recoveryId, finishedBy }: FinishContingencyTicketRecoveryInput,
): Promise<FinishContingencyTicketRecoveryOutcome> {
  return recoveries.transaction<FinishContingencyTicketRecoveryOutcome>(async (tx) => {
    const recovery = await tx.lockRecovery(recoveryId);
    if (recovery === undefined) {
      return { kind: "not_found" };
    }
    if (recovery.finished) {
      return { kind: "already_finished" };
    }
    await tx.recordFinished({
      recoveryId,
      registerId: recovery.registerId,
      finishedBy,
      at: clock.now(),
    });
    return { kind: "finished" };
  });
}
