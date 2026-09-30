import type { PulledChange, PullPage } from "../model/pull-page.js";

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
