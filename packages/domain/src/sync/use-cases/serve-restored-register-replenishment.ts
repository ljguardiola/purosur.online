import {
  REPLENISHMENT_PAGE_MAX_EVENTS,
  REPLENISHMENT_PAGE_READ_LIMIT,
} from "../model/replenishment-page.js";
import type {
  EventPosition,
  ReplenishedEvent,
  ReplenishedUser,
  ServeRestoredRegisterReplenishmentPorts,
} from "./restored-register-replenishment-ports.js";

export interface ServeRestoredRegisterReplenishmentInput {
  registerId: string;
  predecessorDeviceId: string;
  lastAcknowledgedSeq: number;
  after?: EventPosition;
}

export type ServeRestoredRegisterReplenishmentOutcome =
  | { kind: "predecessor_not_of_register" }
  | { kind: "predecessor_not_revoked" }
  | { kind: "cursor_not_of_replenishment" }
  | {
      kind: "replenishment";
      events: ReplenishedEvent[];
      next: EventPosition | null;
      users: ReplenishedUser[];
    };

export async function serveRestoredRegisterReplenishment(
  { replenishment }: ServeRestoredRegisterReplenishmentPorts,
  {
    registerId,
    predecessorDeviceId,
    lastAcknowledgedSeq,
    after,
  }: ServeRestoredRegisterReplenishmentInput,
): Promise<ServeRestoredRegisterReplenishmentOutcome> {
  const standing = await replenishment.predecessorStanding(registerId, predecessorDeviceId);
  if (standing === "not_of_register") {
    return { kind: "predecessor_not_of_register" };
  }
  if (standing === "not_revoked") {
    return { kind: "predecessor_not_revoked" };
  }
  if (
    after &&
    !(await replenishment.isReplenishmentCursor(registerId, predecessorDeviceId, after))
  ) {
    return { kind: "cursor_not_of_replenishment" };
  }
  const read = await replenishment.ownEventsAbove(
    registerId,
    { predecessorDeviceId, lastAcknowledgedSeq },
    after,
    REPLENISHMENT_PAGE_READ_LIMIT,
  );
  const events = read.slice(0, REPLENISHMENT_PAGE_MAX_EVENTS);
  const last = events.at(-1);
  const next =
    read.length > events.length && last
      ? { deviceId: last.deviceId, deviceSeq: last.event.device_seq }
      : null;
  return {
    kind: "replenishment",
    events,
    next,
    users: await replenishment.branchUsers(registerId),
  };
}
