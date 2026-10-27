import type { RestorationProtocolEvidence } from "./restoration-protocol-evidence.js";

export interface ContingencyTicketRecoveryPredecessor {
  deviceId: string;
  lastAcknowledgedSeq: number;
}

export type ContingencyTicketRecoveryStatus<TFailure> =
  | { kind: "awaiting" }
  | { kind: "finished" }
  | { kind: "failed"; failure: TFailure };

export interface ContingencyTicketRecoveryRequester<TFailure> {
  ask(predecessorDeviceId: string): Promise<ContingencyTicketRecoveryStatus<TFailure>>;
}

export interface AwaitedContingencyTicketRecovery {
  predecessor(): Promise<ContingencyTicketRecoveryPredecessor | undefined>;
  release(predecessor: ContingencyTicketRecoveryPredecessor): Promise<void>;
}

export interface AwaitContingencyTicketRecoveryPorts<TFailure> {
  evidence: RestorationProtocolEvidence;
  cloud: ContingencyTicketRecoveryRequester<TFailure>;
  awaited: AwaitedContingencyTicketRecovery;
}
