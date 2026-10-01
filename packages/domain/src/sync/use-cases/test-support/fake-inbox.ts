import type { PushedEvent } from "../../model/push-batch.js";
import type { Inbox, InboxTransaction, PushReport } from "../sync-ports.js";

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
}

export class FakeInbox implements Inbox {
  state: FakeInboxState = { received: [], reports: [] };
  calls: string[] = [];
  failReceiving = false;

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

export function fakeEvent(deviceSeq: number, eventId = `event-${deviceSeq}`): PushedEvent {
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
    chain_hmac: `hmac-${deviceSeq}`,
  };
}
