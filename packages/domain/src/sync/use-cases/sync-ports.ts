import type { LimitedEndpoint } from "../model/installation-request-limit.js";
import type {
  PullAudience,
  PulledEntity,
  PullingRegister,
  PullReach,
} from "../model/pull-audience.js";
import type { PulledChange, PullPage } from "../model/pull-page.js";
import type { PushedEvent, RegisterTelemetry } from "../model/push-batch.js";

export type { PullAudience, PulledChange, PulledEntity, PullingRegister, PullPage, PullReach };

export interface Clock {
  now(): Date;
}

export interface ChangeLog<TChange extends PulledChange> {
  transaction<TOutcome>(
    work: (tx: ChangeLogTransaction<TChange>) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface ChangeLogTransaction<TChange extends PulledChange> {
  recordObservedPull(deviceId: string, since: number, at: Date): Promise<void>;
  pullingRegister(deviceId: string): Promise<PullingRegister>;
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

export interface EventChain {
  // previousLink is null for an installation's first event.
  link(chainKey: string, previousLink: string | null, canonicalEvent: string): string;
}

export interface Inbox {
  transaction<TOutcome>(work: (tx: InboxTransaction) => Promise<TOutcome>): Promise<TOutcome>;
}

export interface HeldEvent {
  eventId: string;
  chainHmac: string;
}

export interface HeldEventPosition {
  deviceId: string;
  deviceSeq: number;
}

export interface InboxTransaction {
  lockDevice(deviceId: string): Promise<void>;
  installationRevoked(deviceId: string): Promise<boolean>;
  receivedDeviceSeqs(deviceId: string): Promise<number[]>;
  receivedEventsAt(
    deviceId: string,
    deviceSeqs: readonly number[],
  ): Promise<ReadonlyMap<number, HeldEvent>>;
  // Where the inbox holds each of these event ids, whichever installation holds it.
  receivedEventPositions(
    eventIds: readonly string[],
  ): Promise<ReadonlyMap<string, HeldEventPosition>>;
  receive(deviceId: string, events: readonly PushedEvent[], receivedAt: Date): Promise<void>;
  recordPushReport(deviceId: string, report: PushReport, at: Date): Promise<void>;
  outboxChainKey(deviceId: string): Promise<string | undefined>;
  receivedChainLink(deviceId: string, deviceSeq: number): Promise<string | undefined>;
  setAsideRefusedPush(
    deviceId: string,
    events: readonly PushedEvent[],
    refusedAt: Date,
  ): Promise<void>;
  revokeForBrokenChain(deviceId: string, revokedAt: Date): Promise<void>;
}

export interface RequestAdmission {
  transaction<TOutcome>(
    work: (tx: RequestAdmissionTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RequestAdmissionTransaction {
  lockRequestAttempts(deviceId: string, endpoint: LimitedEndpoint): Promise<void>;
  admittedRequests(deviceId: string, endpoint: LimitedEndpoint, since: Date): Promise<Date[]>;
  recordAdmittedRequest(deviceId: string, endpoint: LimitedEndpoint, at: Date): Promise<void>;
  // Bookkeeping of the limiter: what it forgets was never business data.
  forgetRequestsThrough(deviceId: string, endpoint: LimitedEndpoint, through: Date): Promise<void>;
}

export interface AdmissionPorts {
  admission: RequestAdmission;
  clock: Clock;
}

export interface ReceivePorts {
  inbox: Inbox;
  eventChain: EventChain;
  clock: Clock;
}

export interface LocalOutbox {
  // Oldest first, by device_seq.
  unacknowledged(limit: number): Promise<PushedEvent[]>;
  acknowledgeThrough(deviceSeq: number): Promise<void>;
  resendFrom(deviceSeq: number): Promise<void>;
  // Acknowledged or not.
  holdsEvent(deviceSeq: number): Promise<boolean>;
  holdsEventAfter(deviceSeq: number): Promise<boolean>;
  // The outbox lost events outside the system: the register stops opening new sales.
  recordCompromised(): Promise<void>;
}

// Only the register's own copy of what the cloud's inbox already holds.
export interface OutboxPruning {
  // Removes every acknowledged event whose acknowledgement came strictly before the cutoff and
  // returns how many; an event the cloud has not acknowledged is never removed.
  forgetAcknowledgedBefore(cutoff: Date): Promise<number>;
}

export interface PruneOutboxPorts {
  outbox: OutboxPruning;
  clock: Clock;
}

export type CloudEventInboxAnswer<TFailure> =
  | { kind: "received"; ackSeq: number }
  | { kind: "gap"; ackSeq: number; expectedSeq: number }
  | { kind: "stale_device"; ackSeq: number }
  | { kind: "update_required"; ackSeq: number }
  | { kind: "revoked" }
  | { kind: "failed"; failure: TFailure };

export interface CloudEventInbox<TFailure> {
  push(events: readonly PushedEvent[]): Promise<CloudEventInboxAnswer<TFailure>>;
}

// Once recorded, the register keeps knowing it was revoked: nothing the cloud answers later undoes it.
export interface LocalInstallation {
  recordRevoked(): Promise<void>;
}

export interface PushOutboxPorts<TFailure> {
  outbox: LocalOutbox;
  inbox: CloudEventInbox<TFailure>;
  installation: LocalInstallation;
}

export type CloudInstallationStanding<TFailure> =
  | { kind: "in_service" }
  | { kind: "revoked" }
  | { kind: "failed"; failure: TFailure };

export interface CloudInstallationCheck<TFailure> {
  standing(): Promise<CloudInstallationStanding<TFailure>>;
}

export interface CheckInstallationPorts<TFailure> {
  installation: LocalInstallation;
  cloud: CloudInstallationCheck<TFailure>;
}
