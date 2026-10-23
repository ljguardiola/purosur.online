import type { PushedEvent } from "../model/push-batch.js";

export interface EventPosition {
  deviceId: string;
  deviceSeq: number;
}

export interface ReplenishmentPosition {
  predecessorDeviceId: string;
  lastAcknowledgedSeq: number;
}

export interface ReplenishedEvent {
  deviceId: string;
  event: PushedEvent;
}

export interface InstallationReceivedSeqs {
  deviceId: string;
  seqs: number[];
}

export interface RestoredRegisterReplenishment {
  // Of each installation of the register a refused push left events of.
  receivedSeqsOfRefusedInstallations(registerId: string): Promise<InstallationReceivedSeqs[]>;
  // In installation enrollment order, then device sequence; strictly after `after` when given. An
  // event a refused push left a copy of above its installation's sequence in `setAsideAbove` was set
  // aside and is not served.
  ownEventsAbove(
    registerId: string,
    position: ReplenishmentPosition,
    after: EventPosition | undefined,
    limit: number,
    setAsideAbove: ReadonlyMap<string, number>,
  ): Promise<ReplenishedEvent[]>;
}

export interface ServeRestoredRegisterReplenishmentPorts {
  replenishment: RestoredRegisterReplenishment;
}
