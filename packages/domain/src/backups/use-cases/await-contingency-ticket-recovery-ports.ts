import type { RestorationEvidence } from "../../register/index.js";

export interface ContingencyTicketRecoveryPredecessor {
  deviceId: string;
  lastAcknowledgedSeq: number;
}

export type ContingencyTicketRecoveryStatus<TFailure> =
  | { kind: "awaiting" }
  | { kind: "finished" }
  | { kind: "failed"; failure: TFailure };

export interface RestorationEvidenceReader {
  evidence(): RestorationEvidence;
}

export interface ContingencyTicketRecoveryRequester<TFailure> {
  ask(predecessorDeviceId: string): Promise<ContingencyTicketRecoveryStatus<TFailure>>;
}

export interface AwaitedContingencyTicketRecovery {
  predecessor(): Promise<ContingencyTicketRecoveryPredecessor | undefined>;
  release(predecessor: ContingencyTicketRecoveryPredecessor): Promise<void>;
}

export interface AwaitContingencyTicketRecoveryPorts<TFailure> {
  restoration: RestorationEvidenceReader;
  cloud: ContingencyTicketRecoveryRequester<TFailure>;
  awaited: AwaitedContingencyTicketRecovery;
}
