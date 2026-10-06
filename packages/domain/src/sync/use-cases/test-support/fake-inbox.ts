import { canonicalOutboxEvent, type OutboxEvent } from "../../model/outbox-event.js";
import type { PushedEvent } from "../../model/push-batch.js";
import type { ChainBrokenAlert, Inbox, InboxTransaction, PushReport } from "../sync-ports.js";
import { FAKE_CHAIN_KEY, fakeEventChain } from "./fake-event-chain.js";

interface FakeReceivedEvent {
  deviceId: string;
  event: PushedEvent;
  receivedAt: Date;
}

interface FakePushReport extends PushReport {
  deviceId: string;
  at: Date;
}

export interface FakeInboxState {
  received: FakeReceivedEvent[];
  reports: FakePushReport[];
  chainAnchors: Record<string, string>;
  chainBrokenAlerts: ChainBrokenAlert[];
}

export class FakeInbox implements Inbox {
  state: FakeInboxState = { received: [], reports: [], chainAnchors: {}, chainBrokenAlerts: [] };
  calls: string[] = [];
  failReceiving = false;
  chainKeys = new Map<string, string | undefined>();

  constructor(receivedSeqs: { deviceId: string; seqs: number[] }[] = []) {
    for (const { deviceId, seqs } of receivedSeqs) {
      for (const seq of seqs) {
        this.state.received.push({
          deviceId,
          event: fakeEvent(seq),
          receivedAt: new Date(0),
        });
      }
      if (seqs.length > 0) {
        this.state.chainAnchors[deviceId] = fakeEvent(Math.max(...seqs)).chain_hmac;
      }
    }
  }

  receivedSeqs(deviceId: string): number[] {
    return this.state.received
      .filter((entry) => entry.deviceId === deviceId)
      .map((entry) => entry.event.device_seq);
  }

  async transaction<TOutcome>(
    work: (tx: InboxTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const working = structuredClone(this.state);
    const outcome = await work({
      lockDevice: async (deviceId) => {
        this.calls.push(`lockDevice ${deviceId}`);
      },
      receivedDeviceSeqs: async (deviceId) => {
        this.calls.push(`receivedDeviceSeqs ${deviceId}`);
        return working.received
          .filter((entry) => entry.deviceId === deviceId)
          .map((entry) => entry.event.device_seq);
      },
      receivedEventIds: async (deviceId, deviceSeqs) => {
        this.calls.push(`receivedEventIds ${deviceId}`);
        const wanted = new Set(deviceSeqs);
        return new Map(
          working.received
            .filter((entry) => entry.deviceId === deviceId && wanted.has(entry.event.device_seq))
            .map((entry) => [entry.event.device_seq, entry.event.event_id]),
        );
      },
      chainAnchor: async (deviceId) => {
        this.calls.push(`chainAnchor ${deviceId}`);
        return working.chainAnchors[deviceId] ?? null;
      },
      adoptChainAnchor: async (deviceId, link) => {
        this.calls.push(`adoptChainAnchor ${deviceId}`);
        working.chainAnchors[deviceId] = link;
      },
      openChainBrokenAlert: async (alert) => {
        this.calls.push(`openChainBrokenAlert ${alert.deviceId}`);
        working.chainBrokenAlerts.push(structuredClone(alert));
      },
      outboxChainKey: async (deviceId) => {
        this.calls.push(`outboxChainKey ${deviceId}`);
        return this.chainKeys.has(deviceId) ? this.chainKeys.get(deviceId) : FAKE_CHAIN_KEY;
      },
      receive: async (deviceId, events, receivedAt) => {
        this.calls.push(`receive ${deviceId}`);
        if (this.failReceiving) {
          throw new Error("the inbox could not be written");
        }
        for (const event of events) {
          working.received.push({ deviceId, event: structuredClone(event), receivedAt });
        }
      },
      recordPushReport: async (deviceId, report, at) => {
        this.calls.push(`recordPushReport ${deviceId}`);
        working.reports.push({ deviceId, ...structuredClone(report), at });
      },
    });
    this.state = working;
    return outcome;
  }
}

export function unchainedFakeEvent(deviceSeq: number, eventId = `event-${deviceSeq}`): OutboxEvent {
  return {
    event_id: eventId,
    device_seq: deviceSeq,
    aggregate_type: "Sale",
    aggregate_id: `sale-${deviceSeq}`,
    event_type: "sale_opened",
    schema_version: 1,
    payload: { seq: deviceSeq },
    occurred_at: "2026-09-30T12:00:00.000Z",
    actor_id: "user-1",
  };
}

export function chainedFrom(
  previousLink: string | null,
  event: OutboxEvent,
  chainKey = FAKE_CHAIN_KEY,
): PushedEvent {
  return {
    ...event,
    chain_hmac: fakeEventChain.link(chainKey, previousLink, canonicalOutboxEvent(event)),
  };
}

export function fakeEvent(deviceSeq: number, eventId = `event-${deviceSeq}`): PushedEvent {
  const previousLink = deviceSeq === 1 ? null : fakeEvent(deviceSeq - 1).chain_hmac;
  return chainedFrom(previousLink, unchainedFakeEvent(deviceSeq, eventId));
}
