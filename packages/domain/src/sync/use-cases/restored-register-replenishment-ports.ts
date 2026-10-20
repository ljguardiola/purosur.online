import type { PushedEvent } from "../model/push-batch.js";

export type PredecessorStanding = "not_of_register" | "not_revoked" | "revoked";

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

export interface ReplenishedUser {
  userId: string;
  firstName: string;
  roleId: string;
  salt: string | null;
  pinHash: string | null;
  active: boolean;
  version: number;
}

export interface RestoredRegisterReplenishment {
  predecessorStanding(
    registerId: string,
    predecessorDeviceId: string,
  ): Promise<PredecessorStanding>;
  // The predecessor, or an installation of the register enrolled after it.
  isReplenishmentCursor(
    registerId: string,
    predecessorDeviceId: string,
    cursor: EventPosition,
  ): Promise<boolean>;
  // In installation enrollment order, then device sequence; strictly after `after` when given.
  ownEventsAbove(
    registerId: string,
    position: ReplenishmentPosition,
    after: EventPosition | undefined,
    limit: number,
  ): Promise<ReplenishedEvent[]>;
  branchUsers(registerId: string): Promise<ReplenishedUser[]>;
}

export interface ServeRestoredRegisterReplenishmentPorts {
  replenishment: RestoredRegisterReplenishment;
}
