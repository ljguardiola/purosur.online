import { highestContiguousSeq } from "../model/contiguous-seq.js";
import { canonicalOutboxEvent } from "../model/outbox-event.js";
import type { PushedEvent, RegisterTelemetry } from "../model/push-batch.js";
import { registerVersionAccepted } from "../model/register-version.js";
import type { EventChain, InboxTransaction, ReceivePorts } from "./sync-ports.js";

export interface ReceivePushedEventsInput {
  deviceId: string;
  appVersion: string;
  telemetry: RegisterTelemetry;
  events: readonly PushedEvent[];
}

export type ReceivePushedEventsOutcome =
  | { kind: "received"; ackSeq: number }
  | { kind: "gap"; ackSeq: number; expectedSeq: number }
  | { kind: "stale_device"; ackSeq: number }
  | { kind: "update_required"; ackSeq: number }
  | { kind: "chain_broken" }
  | { kind: "revoked" };

export async function receivePushedEvents(
  { inbox, eventChain, clock }: ReceivePorts,
  { deviceId, appVersion, telemetry, events }: ReceivePushedEventsInput,
): Promise<ReceivePushedEventsOutcome> {
  return inbox.transaction(async (tx) => {
    const now = clock.now();
    await tx.lockDevice(deviceId);
    if (await tx.installationRevoked(deviceId)) {
      return { kind: "revoked" };
    }
    await tx.recordPushReport(deviceId, { appVersion, telemetry }, now);
    const ackSeq = highestContiguousSeq(await tx.receivedDeviceSeqs(deviceId));
    if (!registerVersionAccepted(appVersion)) {
      return { kind: "update_required", ackSeq };
    }

    const heldAt = await tx.receivedEventsAt(
      deviceId,
      events.map((event) => event.device_seq),
    );
    const positions = await tx.receivedEventPositions(events.map((event) => event.event_id));
    const references = new Map<number, Reference>();
    for (const [deviceSeq, held] of heldAt) {
      references.set(deviceSeq, { eventId: held.eventId, link: held.chainHmac });
    }
    const batchSeqOfEventId = new Map<string, number>();
    const toReceive: PushedEvent[] = [];
    let misplaced = false;
    let expectedSeq = ackSeq + 1;
    for (const event of events) {
      if (event.device_seq > expectedSeq) {
        return { kind: "gap", ackSeq, expectedSeq };
      }
      const reference = references.get(event.device_seq);
      if (reference !== undefined && reference.eventId !== event.event_id) {
        return { kind: "stale_device", ackSeq };
      }
      if (reference === undefined) {
        toReceive.push(event);
        references.set(event.device_seq, { eventId: event.event_id, link: event.chain_hmac });
      }
      const position = positions.get(event.event_id);
      const batchSeq = batchSeqOfEventId.get(event.event_id);
      batchSeqOfEventId.set(event.event_id, batchSeq ?? event.device_seq);
      if (
        (position !== undefined &&
          (position.deviceId !== deviceId || position.deviceSeq !== event.device_seq)) ||
        (batchSeq !== undefined && batchSeq !== event.device_seq)
      ) {
        misplaced = true;
      }
      if (event.device_seq === expectedSeq) {
        expectedSeq += 1;
      }
    }

    if (misplaced || !(await chainHolds(tx, eventChain, deviceId, events, references))) {
      await tx.setAsideRefusedPush(deviceId, events, now);
      await tx.revokeForBrokenChain(deviceId, now);
      return { kind: "chain_broken" };
    }

    await tx.receive(deviceId, toReceive, now);
    return {
      kind: "received",
      ackSeq: highestContiguousSeq(await tx.receivedDeviceSeqs(deviceId)),
    };
  });
}

interface Reference {
  eventId: string;
  link: string;
}

async function chainHolds(
  tx: InboxTransaction,
  eventChain: EventChain,
  deviceId: string,
  events: readonly PushedEvent[],
  references: ReadonlyMap<number, Reference>,
): Promise<boolean> {
  if (events.length === 0) {
    return true;
  }
  const chainKey = await tx.outboxChainKey(deviceId);
  if (chainKey === undefined) {
    return false;
  }
  for (const { chain_hmac: pushedLink, ...event } of events) {
    const expectedLink = references.get(event.device_seq)?.link;
    const previousSeq = event.device_seq - 1;
    const previousLink =
      previousSeq === 0
        ? null
        : (references.get(previousSeq)?.link ??
          (await tx.receivedChainLink(deviceId, previousSeq)));
    if (
      previousLink === undefined ||
      pushedLink !== expectedLink ||
      eventChain.link(chainKey, previousLink, canonicalOutboxEvent(event)) !== expectedLink
    ) {
      return false;
    }
  }
  return true;
}
