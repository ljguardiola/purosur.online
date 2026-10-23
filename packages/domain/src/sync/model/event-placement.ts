import { canonicalOutboxEvent } from "../../shared/index.js";
import { highestContiguousSeq } from "./contiguous-seq.js";
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

interface Chain {
  link(chainKey: string, previousLink: string | null, canonicalEvent: string): string;
}

export function eventLinkHolds(
  chain: Chain,
  chainKey: string,
  previousLink: string | null,
  { chain_hmac: link, ...event }: PushedEvent,
): boolean {
  return chain.link(chainKey, previousLink, canonicalOutboxEvent(event)) === link;
}

export function chainedEventsHold(
  chain: Chain,
  chainKey: string,
  previousLink: string | null,
  events: readonly PushedEvent[],
): boolean {
  let link = previousLink;
  for (const event of events) {
    if (!eventLinkHolds(chain, chainKey, link, event)) {
      return false;
    }
    link = event.chain_hmac;
  }
  return true;
}

export function seqsJoinedBy(
  heldSeqs: readonly number[],
  arrivingSeqs: readonly number[],
): { above: number; upTo: number } {
  return {
    above: highestContiguousSeq(heldSeqs),
    upTo: highestContiguousSeq([...heldSeqs, ...arrivingSeqs]),
  };
}
