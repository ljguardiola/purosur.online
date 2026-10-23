import { OFFLINE_FISCAL_DOCUMENT_ISSUED_EVENT_TYPE } from "../../fiscal/index.js";
import { highestContiguousSeq } from "../model/contiguous-seq.js";
import { eventLinkHolds, placementOfEvent, seqsJoinedBy } from "../model/event-placement.js";
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
    const versionAccepted = registerVersionAccepted(appVersion);
    const { registerId, locationId } = await tx.installationRegister(deviceId);
    await tx.recordRegisterVersionStanding(
      { registerId, deviceId, appVersion, accepted: versionAccepted },
      now,
    );
    const keptInService = async (
      outcome: ReceivePushedEventsOutcome,
    ): Promise<ReceivePushedEventsOutcome> => {
      await tx.recordRegisterStops({ registerId, deviceId, locationId, report: telemetry }, now);
      return outcome;
    };
    const heldSeqs = await tx.receivedDeviceSeqs(deviceId);
    const ackSeq = highestContiguousSeq(heldSeqs);
    if (!versionAccepted) {
      return keptInService({ kind: "update_required", ackSeq });
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
        return keptInService({ kind: "gap", ackSeq, expectedSeq });
      }
      const reference = references.get(event.device_seq);
      const position = positions.get(event.event_id);
      const placement = placementOfEvent(deviceId, event, reference?.eventId, position);
      if (placement.stale) {
        return keptInService({ kind: "stale_device", ackSeq });
      }
      if (!placement.held) {
        toReceive.push(event);
        references.set(event.device_seq, { eventId: event.event_id, link: event.chain_hmac });
      }
      const batchSeq = batchSeqOfEventId.get(event.event_id);
      batchSeqOfEventId.set(event.event_id, batchSeq ?? event.device_seq);
      if (placement.misplaced || (batchSeq !== undefined && batchSeq !== event.device_seq)) {
        misplaced = true;
      }
      if (event.device_seq === expectedSeq) {
        expectedSeq += 1;
      }
    }

    const { above, upTo } = seqsJoinedBy(
      heldSeqs,
      events.map((event) => event.device_seq),
    );
    const heldJoined = await tx.receivedEventsBetween(deviceId, above, upTo);
    for (const held of heldJoined) {
      references.set(held.device_seq, { eventId: held.event_id, link: held.chain_hmac });
    }

    if (
      misplaced ||
      !(await chainHolds(tx, eventChain, deviceId, [...events, ...heldJoined], references))
    ) {
      await tx.setAsideRefusedPush(deviceId, events, now);
      await tx.revokeForBrokenChain(deviceId, now);
      return { kind: "chain_broken" };
    }

    await tx.receive(deviceId, toReceive, now);
    await tx.advanceOfflineNumbering(
      toReceive.filter((event) => event.event_type === OFFLINE_FISCAL_DOCUMENT_ISSUED_EVENT_TYPE),
      now,
    );
    await tx.recordAcceptedPush(deviceId, now);
    await tx.recordRegisterSynced(registerId, now);
    if (events.length === 0) {
      await tx.recordReportsEveryCycle(deviceId, now);
      await tx.recordCaughtUp(deviceId, now);
    }
    return keptInService({
      kind: "received",
      ackSeq: highestContiguousSeq(await tx.receivedDeviceSeqs(deviceId)),
    });
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
  for (const event of events) {
    const expectedLink = references.get(event.device_seq)?.link;
    const previousSeq = event.device_seq - 1;
    const previousLink =
      previousSeq === 0
        ? null
        : (references.get(previousSeq)?.link ??
          (await tx.receivedChainLink(deviceId, previousSeq)));
    if (
      previousLink === undefined ||
      event.chain_hmac !== expectedLink ||
      !eventLinkHolds(eventChain, chainKey, previousLink, event)
    ) {
      return false;
    }
  }
  return true;
}
