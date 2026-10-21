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

export interface RestoredRegisterReplenishment {
  // In installation enrollment order, then device sequence; strictly after `after` when given.
  ownEventsAbove(
    registerId: string,
    position: ReplenishmentPosition,
    after: EventPosition | undefined,
    limit: number,
  ): Promise<ReplenishedEvent[]>;
}

export interface ServeRestoredRegisterReplenishmentPorts {
  replenishment: RestoredRegisterReplenishment;
}
