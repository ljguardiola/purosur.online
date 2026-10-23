import { canonicalOutboxEvent } from "../../shared/index.js";
import type { PushedEvent } from "./push-batch.js";

interface EventPosition {
  deviceId: string;
  deviceSeq: number;
}

interface EventPlacement {
  held: boolean;
  stale: boolean;
  misplaced: boolean;
}

export function placementOfEvent(
  deviceId: string,
  event: PushedEvent,
  heldEventIdAtSeq: string | undefined,
  position: EventPosition | undefined,
): EventPlacement {
  return {
    held: heldEventIdAtSeq !== undefined,
    stale: heldEventIdAtSeq !== undefined && heldEventIdAtSeq !== event.event_id,
    misplaced:
      position !== undefined &&
      (position.deviceId !== deviceId || position.deviceSeq !== event.device_seq),
  };
}

export function eventLinkHolds(
  chain: { link(chainKey: string, previousLink: string | null, canonicalEvent: string): string },
  chainKey: string,
  previousLink: string | null,
  { chain_hmac: link, ...event }: PushedEvent,
): boolean {
  return chain.link(chainKey, previousLink, canonicalOutboxEvent(event)) === link;
}
