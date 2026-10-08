import { canonicalOutboxEvent, type OutboxEvent } from "../../../shared/index.js";
import type { PushedEvent } from "../../model/push-batch.js";
import type { Inbox, InboxTransaction, PushReport } from "../sync-ports.js";
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

interface FakeVersionStanding {
  deviceId: string;
  appVersion: string;
  accepted: boolean;
  at: Date;
}

export interface FakeInboxState {
  received: FakeReceivedEvent[];
  reports: FakePushReport[];
  versionStandings: FakeVersionStanding[];
  acceptedPushes: { deviceId: string; at: Date }[];
  refusedPushes: { deviceId: string; events: readonly PushedEvent[]; refusedAt: Date }[];
  brokenChainRevocations: { deviceId: string; revokedAt: Date }[];
}

export class FakeInbox implements Inbox {
  state: FakeInboxState = {
    received: [],
    reports: [],
    versionStandings: [],
    acceptedPushes: [],
    refusedPushes: [],
    brokenChainRevocations: [],
  };
  calls: string[] = [];
  failReceiving = false;
  failSettingAside = false;
  chainKeys = new Map<string, string | undefined>();
  revokedDevices = new Set<string>();

  constructor(receivedSeqs: { deviceId: string; seqs: number[] }[] = []) {
    for (const { deviceId, seqs } of receivedSeqs) {
      for (const seq of seqs) {
        this.state.received.push({
          deviceId,
          event: fakeEvent(seq),
          receivedAt: new Date(0),
        });
      }
    }
  }

  holdEvents(deviceId: string, ...events: PushedEvent[]): void {
    for (const event of events) {
      this.state.received.push({ deviceId, event, receivedAt: new Date(0) });
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
      installationRevoked: async (deviceId) => {
        this.calls.push(`installationRevoked ${deviceId}`);
        return (
          this.revokedDevices.has(deviceId) ||
          working.brokenChainRevocations.some((revocation) => revocation.deviceId === deviceId)
        );
      },
      receivedDeviceSeqs: async (deviceId) => {
        this.calls.push(`receivedDeviceSeqs ${deviceId}`);
        return working.received
          .filter((entry) => entry.deviceId === deviceId)
          .map((entry) => entry.event.device_seq);
      },
      receivedEventsAt: async (deviceId, deviceSeqs) => {
        this.calls.push(`receivedEventsAt ${deviceId}`);
        const wanted = new Set(deviceSeqs);
        return new Map(
          working.received
            .filter((entry) => entry.deviceId === deviceId && wanted.has(entry.event.device_seq))
            .map((entry) => [
              entry.event.device_seq,
              { eventId: entry.event.event_id, chainHmac: entry.event.chain_hmac },
            ]),
        );
      },
      receivedEventPositions: async (eventIds) => {
        this.calls.push("receivedEventPositions");
        const wanted = new Set(eventIds);
        return new Map(
          working.received
            .filter((entry) => wanted.has(entry.event.event_id))
            .map((entry) => [
              entry.event.event_id,
              { deviceId: entry.deviceId, deviceSeq: entry.event.device_seq },
            ]),
        );
      },
      receivedChainLink: async (deviceId, deviceSeq) => {
        this.calls.push(`receivedChainLink ${deviceId}`);
        return working.received.find(
          (entry) => entry.deviceId === deviceId && entry.event.device_seq === deviceSeq,
        )?.event.chain_hmac;
      },
      setAsideRefusedPush: async (deviceId, events, refusedAt) => {
        this.calls.push(`setAsideRefusedPush ${deviceId}`);
        if (this.failSettingAside) {
          throw new Error("the refused push could not be kept");
        }
        working.refusedPushes.push({ deviceId, events: structuredClone(events), refusedAt });
      },
      revokeForBrokenChain: async (deviceId, revokedAt) => {
        this.calls.push(`revokeForBrokenChain ${deviceId}`);
        working.brokenChainRevocations.push({ deviceId, revokedAt });
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
      recordVersionStanding: async (deviceId, standing, at) => {
        this.calls.push(`recordVersionStanding ${deviceId}`);
        working.versionStandings.push({ deviceId, ...standing, at });
      },
      recordAcceptedPush: async (deviceId, at) => {
        this.calls.push(`recordAcceptedPush ${deviceId}`);
        working.acceptedPushes.push({ deviceId, at });
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
