import {
  REPLENISHMENT_PAGE_MAX_EVENTS,
  REPLENISHMENT_PAGE_READ_LIMIT,
} from "../model/replenishment-page.js";
import type {
  EventPosition,
  ReplenishedEvent,
  ServeRestoredRegisterReplenishmentPorts,
} from "./restored-register-replenishment-ports.js";

export interface ServeRestoredRegisterReplenishmentInput {
  registerId: string;
  predecessorDeviceId: string;
  lastAcknowledgedSeq: number;
  after?: EventPosition;
}

export interface ServedReplenishmentPage {
  events: ReplenishedEvent[];
  next: EventPosition | null;
}

export async function serveRestoredRegisterReplenishment(
  { replenishment }: ServeRestoredRegisterReplenishmentPorts,
  {
    registerId,
    predecessorDeviceId,
    lastAcknowledgedSeq,
    after,
  }: ServeRestoredRegisterReplenishmentInput,
): Promise<ServedReplenishmentPage> {
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
  return { events, next };
}
