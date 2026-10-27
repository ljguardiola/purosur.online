import type { Clock } from "../../shared/index.js";

export type ContingencyTicketRecoveryStanding = { kind: "awaiting" } | { kind: "finished" };

export interface OpenContingencyTicketRecovery {
  registerId: string;
  restoredDeviceId: string;
  at: Date;
}

export interface LockedContingencyTicketRecovery {
  registerId: string;
  finished: boolean;
}

export interface FinishedContingencyTicketRecovery {
  recoveryId: string;
  registerId: string;
  finishedBy: string;
  at: Date;
}

export interface ContingencyTicketRecoveryTransaction {
  openRecovery(opening: OpenContingencyTicketRecovery): Promise<ContingencyTicketRecoveryStanding>;
  lockRecovery(recoveryId: string): Promise<LockedContingencyTicketRecovery | undefined>;
  recordFinished(finished: FinishedContingencyTicketRecovery): Promise<void>;
}

export interface ContingencyTicketRecoveries {
  transaction<TOutcome>(
    work: (tx: ContingencyTicketRecoveryTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface AwaitingContingencyTicketRecovery {
  recoveryId: string;
  registerId: string;
  registerName: string;
  openedAt: Date;
}

export interface AwaitingContingencyTicketRecoveries {
  awaiting(): Promise<AwaitingContingencyTicketRecovery[]>;
}

export interface ContingencyTicketRecoveryPorts {
  recoveries: ContingencyTicketRecoveries;
  clock: Clock;
}
