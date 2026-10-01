import type { PulledChange, PullPage } from "../model/pull-page.js";
import type { PushedEvent, RegisterTelemetry } from "../model/push-batch.js";

export type { PulledChange, PullPage };

export interface Clock {
  now(): Date;
}

export interface ChangeLog<TChange extends PulledChange> {
  transaction<TOutcome>(
    work: (tx: ChangeLogTransaction<TChange>) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface PullAudience {
  locationId: string;
  registerId: string;
}

export interface ChangeLogTransaction<TChange extends PulledChange> {
  recordObservedPull(deviceId: string, since: number, at: Date): Promise<void>;
  changesAfter(audience: PullAudience, since: number, limit: number): Promise<TChange[]>;
}

export interface PullPorts<TChange extends PulledChange> {
  changeLog: ChangeLog<TChange>;
  clock: Clock;
}

export type CloudChangeFeedAnswer<TChange extends PulledChange, TFailure> =
  | { kind: "page"; page: PullPage<TChange> }
  | { kind: "failed"; failure: TFailure };

export interface CloudChangeFeed<TChange extends PulledChange, TFailure> {
  pageAfter(since: number): Promise<CloudChangeFeedAnswer<TChange, TFailure>>;
}

export interface LocalReplica<TChange extends PulledChange> {
  savedCursor(): Promise<number>;
  // Saves the page's changes and its cursor together, or neither.
  savePage(page: PullPage<TChange>): Promise<void>;
}

export interface CatchUpPorts<TChange extends PulledChange, TFailure> {
  replica: LocalReplica<TChange>;
  feed: CloudChangeFeed<TChange, TFailure>;
}

export interface PushReport {
  appVersion: string;
  telemetry: RegisterTelemetry;
}

export interface Inbox {
  transaction<TOutcome>(work: (tx: InboxTransaction) => Promise<TOutcome>): Promise<TOutcome>;
}

export interface InboxTransaction {
  lockDevice(deviceId: string): Promise<void>;
  receivedDeviceSeqs(deviceId: string): Promise<number[]>;
  receivedEventIds(
    deviceId: string,
    deviceSeqs: readonly number[],
  ): Promise<ReadonlyMap<number, string>>;
  receive(deviceId: string, events: readonly PushedEvent[], receivedAt: Date): Promise<void>;
  recordPushReport(deviceId: string, report: PushReport, at: Date): Promise<void>;
}

export interface ReceivePorts {
  inbox: Inbox;
  clock: Clock;
}

export interface LocalOutbox {
  // Oldest first, by device_seq.
  unacknowledged(limit: number): Promise<PushedEvent[]>;
  acknowledgeThrough(deviceSeq: number): Promise<void>;
  resendFrom(deviceSeq: number): Promise<void>;
}

export type CloudEventInboxAnswer<TFailure> =
  | { kind: "received"; ackSeq: number }
  | { kind: "gap"; ackSeq: number; expectedSeq: number }
  | { kind: "stale_device"; ackSeq: number }
  | { kind: "revoked" }
  | { kind: "failed"; failure: TFailure };

export interface CloudEventInbox<TFailure> {
  push(events: readonly PushedEvent[]): Promise<CloudEventInboxAnswer<TFailure>>;
}

export interface PushOutboxPorts<TFailure> {
  outbox: LocalOutbox;
  inbox: CloudEventInbox<TFailure>;
}
