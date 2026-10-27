import type {
  ContingencyTicketRecoveryPorts,
  ContingencyTicketRecoveryStanding,
} from "./contingency-ticket-recovery-ports.js";

export interface AskContingencyTicketRecoveryInput {
  registerId: string;
  restoredDeviceId: string;
}

export type AskContingencyTicketRecoveryOutcome = ContingencyTicketRecoveryStanding;

export async function askContingencyTicketRecovery(
  { recoveries, clock }: ContingencyTicketRecoveryPorts,
  { registerId, restoredDeviceId }: AskContingencyTicketRecoveryInput,
): Promise<AskContingencyTicketRecoveryOutcome> {
  return recoveries.transaction((tx) =>
    tx.openRecovery({ registerId, restoredDeviceId, at: clock.now() }),
  );
}
