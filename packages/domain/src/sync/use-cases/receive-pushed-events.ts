import { highestContiguousSeq } from "../model/contiguous-seq.js";
import { canonicalOutboxEvent } from "../model/outbox-event.js";
import { registerVersionAccepted } from "../model/register-version.js";
import type { PushedEvent, RegisterTelemetry } from "../model/push-batch.js";
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

    const heldEventIds = new Map(
      await tx.receivedEventIds(
        deviceId,
        events.map((event) => event.device_seq),
      ),
    );
    const toReceive: PushedEvent[] = [];
    let expectedSeq = ackSeq + 1;
    for (const event of events) {
      if (event.device_seq > expectedSeq) {
        return { kind: "gap", ackSeq, expectedSeq };
      }
      const heldEventId = heldEventIds.get(event.device_seq);
      if (heldEventId !== undefined && heldEventId !== event.event_id) {
        return { kind: "stale_device", ackSeq };
      }
      if (heldEventId === undefined) {
        toReceive.push(event);
        heldEventIds.set(event.device_seq, event.event_id);
      }
      if (event.device_seq === expectedSeq) {
        expectedSeq += 1;
      }
    }

    if (!(await chainHolds(tx, eventChain, deviceId, toReceive))) {
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

async function chainHolds(
  tx: InboxTransaction,
  eventChain: EventChain,
  deviceId: string,
  received: readonly PushedEvent[],
): Promise<boolean> {
  if (received.length === 0) {
    return true;
  }
  const chainKey = await tx.outboxChainKey(deviceId);
  if (chainKey === undefined) {
    return false;
  }
  const receivedLinks = new Map<number, string>();
  for (const { chain_hmac: receivedLink, ...event } of received) {
    const previousSeq = event.device_seq - 1;
    const previousLink =
      previousSeq === 0
        ? null
        : (receivedLinks.get(previousSeq) ?? (await tx.receivedChainLink(deviceId, previousSeq)));
    if (
      previousLink === undefined ||
      eventChain.link(chainKey, previousLink, canonicalOutboxEvent(event)) !== receivedLink
    ) {
      return false;
    }
    receivedLinks.set(event.device_seq, receivedLink);
  }
  return true;
}
