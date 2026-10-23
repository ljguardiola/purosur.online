import { OFFLINE_FISCAL_DOCUMENT_ISSUED_EVENT_TYPE } from "../../fiscal/index.js";
import { placementOfEvent } from "../model/event-placement.js";
import type { PushedEvent } from "../model/push-batch.js";
import type { ReceivePorts } from "./sync-ports.js";

export interface ReceiveRescuedEventsInput {
  registerId: string;
  deviceId: string;
  events: readonly PushedEvent[];
}

export type ReceiveRescuedEventsOutcome =
  | { kind: "received"; received: number; alreadyReceived: number }
  | { kind: "foreign_installation" }
  | { kind: "conflicting" };

export async function receiveRescuedEvents(
  { inbox, clock }: Pick<ReceivePorts, "inbox" | "clock">,
  { registerId, deviceId, events }: ReceiveRescuedEventsInput,
): Promise<ReceiveRescuedEventsOutcome> {
  return inbox.transaction(async (tx) => {
    const now = clock.now();
    await tx.lockDevice(deviceId);
    if ((await tx.installationRegister(deviceId)).registerId !== registerId) {
      return { kind: "foreign_installation" };
    }

    const heldAt = await tx.receivedEventsAt(
      deviceId,
      events.map((event) => event.device_seq),
    );
    const positions = await tx.receivedEventPositions(events.map((event) => event.event_id));
    const eventIdAtSeq = new Map<number, string>();
    for (const [deviceSeq, held] of heldAt) {
      eventIdAtSeq.set(deviceSeq, held.eventId);
    }
    const seqOfEventId = new Map<string, number>();
    const toReceive: PushedEvent[] = [];
    let alreadyReceived = 0;
    for (const event of events) {
      const placement = placementOfEvent(
        deviceId,
        event,
        eventIdAtSeq.get(event.device_seq),
        positions.get(event.event_id),
      );
      const claimedSeq = seqOfEventId.get(event.event_id);
      if (
        placement.stale ||
        placement.misplaced ||
        (claimedSeq !== undefined && claimedSeq !== event.device_seq)
      ) {
        return { kind: "conflicting" };
      }
      if (placement.held) {
        alreadyReceived += 1;
        continue;
      }
      toReceive.push(event);
      eventIdAtSeq.set(event.device_seq, event.event_id);
      seqOfEventId.set(event.event_id, event.device_seq);
    }

    await tx.receive(deviceId, toReceive, now);
    await tx.advanceOfflineNumbering(
      toReceive.filter((event) => event.event_type === OFFLINE_FISCAL_DOCUMENT_ISSUED_EVENT_TYPE),
      now,
    );
    return { kind: "received", received: toReceive.length, alreadyReceived };
  });
}
