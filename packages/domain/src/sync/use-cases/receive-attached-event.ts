import { OFFLINE_FISCAL_DOCUMENT_ISSUED_EVENT_TYPE } from "../../fiscal/index.js";
import { eventLinkHolds, placementOfEvent } from "../model/event-placement.js";
import type { PushedEvent } from "../model/push-batch.js";
import type { ReceivePorts } from "./sync-ports.js";

export interface ReceiveAttachedEventInput {
  deviceId: string;
  event: PushedEvent;
}

export type ReceiveAttachedEventOutcome =
  | { kind: "received" }
  | { kind: "already_received" }
  | { kind: "misplaced" }
  | { kind: "chain_broken" }
  | { kind: "revoked" };

export async function receiveAttachedEvent(
  { inbox, eventChain, clock }: ReceivePorts,
  { deviceId, event }: ReceiveAttachedEventInput,
): Promise<ReceiveAttachedEventOutcome> {
  return inbox.transaction(async (tx) => {
    const now = clock.now();
    await tx.lockDevice(deviceId);
    if (await tx.installationRevoked(deviceId)) {
      return { kind: "revoked" };
    }

    const heldAt = await tx.receivedEventsAt(deviceId, [event.device_seq]);
    const positions = await tx.receivedEventPositions([event.event_id]);
    const placement = placementOfEvent(
      deviceId,
      event,
      heldAt.get(event.device_seq)?.eventId,
      positions.get(event.event_id),
    );
    if (placement.stale || placement.misplaced) {
      return { kind: "misplaced" };
    }
    if (placement.held) {
      return { kind: "already_received" };
    }

    const previousSeq = event.device_seq - 1;
    const previousLink =
      previousSeq === 0 ? null : await tx.receivedChainLink(deviceId, previousSeq);
    if (previousLink !== undefined) {
      const chainKey = await tx.outboxChainKey(deviceId);
      if (chainKey === undefined || !eventLinkHolds(eventChain, chainKey, previousLink, event)) {
        return { kind: "chain_broken" };
      }
    }

    await tx.receive(deviceId, [event], now);
    await tx.advanceOfflineNumbering(
      event.event_type === OFFLINE_FISCAL_DOCUMENT_ISSUED_EVENT_TYPE ? [event] : [],
      now,
    );
    return { kind: "received" };
  });
}
