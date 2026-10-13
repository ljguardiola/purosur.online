import type { Clock } from "../../shared/index.js";
import type { EventQuarantineReason } from "../model/event-quarantine.js";
import type { QuarantineState, ReleasedEventState } from "../model/quarantine-release.js";
import type { AggregateKey } from "../model/synced-fact.js";

export interface HeldEventRecord extends QuarantineState {
  deviceId: string;
  attempts: number;
  lastError: string | null;
}

export interface QuarantineReleaseRecord {
  eventId: string;
  releasedBy: string;
  releasedAt: Date;
  previous: { quarantinedAt: Date | null; attempts: number; lastError: string | null };
  released: ReleasedEventState;
}

export interface QuarantineReleaseTransaction {
  aggregateOfEventInBranch(eventId: string, locationId: string): Promise<AggregateKey | undefined>;
  lockAggregateWaiting(key: AggregateKey): Promise<void>;
  lockEvent(eventId: string): Promise<HeldEventRecord | undefined>;
  releaseForNewSeries(eventId: string, released: ReleasedEventState): Promise<void>;
  recordRelease(release: QuarantineReleaseRecord): Promise<void>;
  lockDeviceQuarantines(deviceId: string): Promise<void>;
  deviceHasQuarantinedEvents(deviceId: string): Promise<boolean>;
  recordDeviceQuarantineCleared(deviceId: string, clearedAt: Date): Promise<void>;
}

export interface QuarantineRelease {
  transaction<T>(work: (tx: QuarantineReleaseTransaction) => Promise<T>): Promise<T>;
}

export interface ReleaseQuarantinedEventPorts {
  quarantineRelease: QuarantineRelease;
  clock: Clock;
}

export interface QuarantinedEventListing {
  eventId: string;
  registerName: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  receivedAt: Date;
  quarantinedAt: Date;
  reason: EventQuarantineReason | null;
}

export interface QuarantinedEventReader {
  quarantinedEventsOfBranch(locationId: string): Promise<QuarantinedEventListing[]>;
}
