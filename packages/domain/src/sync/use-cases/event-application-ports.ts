import type { EventInvariantViolatedDetail, EventsQuarantinedDetail } from "../../alerts/index.js";
import type { Clock, JsonValue } from "../../shared/index.js";
import type { HeldEventState } from "../model/next-event-to-apply.js";
import type { AggregateKey, SyncedFact } from "../model/synced-fact.js";

export type { AggregateKey };

export interface UnappliedEvent extends HeldEventState {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  schemaVersion: number;
  payload: { [member: string]: JsonValue };
  actorId: string;
  attempts: number;
}

export interface FailedAttempt {
  attempts: number;
  nextAttemptAt: Date | null;
  quarantinedAt: Date | null;
  error: string;
}

export interface EventApplicationTransaction {
  lockAggregate(key: AggregateKey): Promise<boolean>;
  unappliedEventsOf(key: AggregateKey): Promise<UnappliedEvent[]>;
  aggregateApplied(key: AggregateKey): Promise<boolean>;
  record(fact: SyncedFact, event: UnappliedEvent): Promise<void>;
  markApplied(eventId: string, at: Date): Promise<void>;
  recordFailedAttempt(eventId: string, failed: FailedAttempt): Promise<void>;
  openQuarantineAlert(details: EventsQuarantinedDetail): Promise<void>;
  openInvariantAlert(details: EventInvariantViolatedDetail): Promise<void>;
}

export interface EventApplication {
  pendingAggregates(): Promise<AggregateKey[]>;
  transaction<T>(work: (tx: EventApplicationTransaction) => Promise<T>): Promise<T>;
}

export type DecodedEvent =
  | { kind: "fact"; fact: SyncedFact }
  | { kind: "unreadable"; reason: string };

export interface EventUpcaster {
  decode(event: UnappliedEvent): DecodedEvent;
}

export interface ApplyPendingEventsPorts {
  eventApplication: EventApplication;
  upcaster: EventUpcaster;
  clock: Clock;
}
