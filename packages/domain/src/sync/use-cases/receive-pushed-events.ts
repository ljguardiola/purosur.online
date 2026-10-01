import { highestContiguousSeq } from "../model/contiguous-seq.js";
import type { PushedEvent, RegisterTelemetry } from "../model/push-batch.js";
import type { ReceivePorts } from "./sync-ports.js";

export interface ReceivePushedEventsInput {
  deviceId: string;
  appVersion: string;
  telemetry: RegisterTelemetry;
  events: readonly PushedEvent[];
}

export type ReceivePushedEventsOutcome =
  | { kind: "received"; ackSeq: number }
  | { kind: "gap"; ackSeq: number; expectedSeq: number }
  | { kind: "stale_device"; ackSeq: number };

export async function receivePushedEvents(
  { inbox, clock }: ReceivePorts,
  { deviceId, appVersion, telemetry, events }: ReceivePushedEventsInput,
): Promise<ReceivePushedEventsOutcome> {
  return inbox.transaction(async (tx) => {
    const now = clock.now();
    await tx.lockDevice(deviceId);
    await tx.recordPushReport(deviceId, { appVersion, telemetry }, now);
    const ackSeq = highestContiguousSeq(await tx.receivedDeviceSeqs(deviceId));

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

    await tx.receive(deviceId, toReceive, now);
    return {
      kind: "received",
      ackSeq: highestContiguousSeq(await tx.receivedDeviceSeqs(deviceId)),
    };
  });
}
