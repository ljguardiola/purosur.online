import type { SyncedFact } from "../model/synced-fact.js";
import type { DecodedEvent } from "./event-application-ports.js";
import type {
  EventPosition,
  ReplenishedEvent,
  ReplenishedUser,
} from "./restored-register-replenishment-ports.js";

export interface RegisterPredecessor {
  deviceId: string;
  lastAcknowledgedSeq: number;
}

export type ReplenishmentRefusal =
  | "predecessor_not_of_register"
  | "predecessor_not_revoked"
  | "cursor_not_of_replenishment";

export interface ReplenishmentPage {
  events: ReplenishedEvent[];
  users: ReplenishedUser[];
  next: EventPosition | null;
}

export type RegisterReplenishmentFeedAnswer<TFailure> =
  | { kind: "page"; page: ReplenishmentPage }
  | { kind: "refused"; refusal: ReplenishmentRefusal }
  | { kind: "unreachable" }
  | { kind: "failed"; failure: TFailure };

export interface RegisterReplenishmentFeed<TFailure> {
  pageAfter(
    predecessor: RegisterPredecessor,
    after: EventPosition | undefined,
  ): Promise<RegisterReplenishmentFeedAnswer<TFailure>>;
}

export interface ReplenishedEventSource {
  eventId: string;
  deviceId: string;
}

export type ReplenishedEventApplication = "applied" | "not_yet_applicable";

export interface RegisterReplenishmentTransaction {
  applyUsers(users: readonly ReplenishedUser[]): Promise<void>;
  eventApplied(eventId: string): Promise<boolean>;
  // Applying an event the register already holds the rows of changes nothing and answers "applied".
  applyFact(fact: SyncedFact, source: ReplenishedEventSource): Promise<ReplenishedEventApplication>;
  recordEventApplied(eventId: string): Promise<void>;
}

export interface RegisterReplenishmentStore {
  predecessor(): Promise<RegisterPredecessor | undefined>;
  // All or nothing: a page that fails leaves no user, fact or applied event behind.
  transaction<TOutcome>(
    work: (tx: RegisterReplenishmentTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
  finish(): Promise<void>;
}

export interface RegisterReplenishmentDecoder {
  decode(event: ReplenishedEvent): DecodedEvent;
}

export interface ReplenishRestoredRegisterPorts<TFailure> {
  feed: RegisterReplenishmentFeed<TFailure>;
  store: RegisterReplenishmentStore;
  decoder: RegisterReplenishmentDecoder;
}
