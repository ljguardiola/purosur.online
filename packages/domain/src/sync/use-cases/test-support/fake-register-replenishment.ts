import type { SyncedFact } from "../../model/synced-fact.js";
import { A_SESSION_OPENED_FACT } from "../../model/test-support/synced-facts.js";
import type {
  RegisterPredecessor,
  RegisterReplenishmentDecoder,
  RegisterReplenishmentFeed,
  RegisterReplenishmentFeedAnswer,
  RegisterReplenishmentStore,
  RegisterReplenishmentTransaction,
  ReplenishedEventApplication,
  ReplenishedEventSource,
  ReplenishmentPage,
} from "../register-replenishment-ports.js";
import type {
  EventPosition,
  ReplenishedEvent,
  ReplenishedUser,
} from "../restored-register-replenishment-ports.js";

export interface AppliedFact {
  fact: SyncedFact;
  source: ReplenishedEventSource;
}

export interface FeedRequest {
  predecessor: RegisterPredecessor;
  after: EventPosition | undefined;
}

export type FakeFailure = { kind: "unreadable" };

export class FakeRegisterReplenishmentFeed implements RegisterReplenishmentFeed<FakeFailure> {
  answers: RegisterReplenishmentFeedAnswer<FakeFailure>[] = [];
  requests: FeedRequest[] = [];

  async pageAfter(
    predecessor: RegisterPredecessor,
    after: EventPosition | undefined,
  ): Promise<RegisterReplenishmentFeedAnswer<FakeFailure>> {
    this.requests.push({ predecessor, after });
    const answer = this.answers[this.requests.length - 1];
    if (answer === undefined) {
      throw new Error("the feed was asked for a page nobody scripted");
    }
    return answer;
  }
}

export function aPage(
  events: ReplenishedEvent[],
  next: EventPosition | null = null,
  users: ReplenishedUser[] = [],
): RegisterReplenishmentFeedAnswer<FakeFailure> {
  const page: ReplenishmentPage = { events, users, next };
  return { kind: "page", page };
}

export class FakeRegisterReplenishmentDecoder implements RegisterReplenishmentDecoder {
  unreadable = new Map<string, string>();
  facts = new Map<string, SyncedFact>();

  decode({ event }: ReplenishedEvent) {
    const reason = this.unreadable.get(event.event_id);
    if (reason !== undefined) {
      return { kind: "unreadable" as const, reason };
    }
    return { kind: "fact" as const, fact: this.facts.get(event.event_id) ?? A_SESSION_OPENED_FACT };
  }
}

export interface ReplenishingRegisterState {
  predecessor: RegisterPredecessor | undefined;
  users: ReplenishedUser[][];
  facts: AppliedFact[];
  appliedEventIds: string[];
}

export type FakeStoreOperation = "applyUsers" | "applyFact" | "recordEventApplied" | "finish";

export class FakeRegisterReplenishmentStore implements RegisterReplenishmentStore {
  state: ReplenishingRegisterState;
  transactions = 0;
  notYetApplicable = new Set<string>();
  failAt: { operation: FakeStoreOperation; eventId?: string } | undefined;

  constructor(predecessor: RegisterPredecessor | undefined) {
    this.state = { predecessor, users: [], facts: [], appliedEventIds: [] };
  }

  async predecessor(): Promise<RegisterPredecessor | undefined> {
    return this.state.predecessor;
  }

  async transaction<TOutcome>(
    work: (tx: RegisterReplenishmentTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactions += 1;
    const working = structuredClone(this.state);
    const failIf = (operation: FakeStoreOperation, eventId?: string) => {
      if (this.failAt?.operation === operation && this.failAt.eventId === eventId) {
        throw new Error("storage unavailable");
      }
    };
    const tx: RegisterReplenishmentTransaction = {
      applyUsers: async (users) => {
        failIf("applyUsers");
        working.users.push(structuredClone([...users]));
      },
      eventApplied: async (eventId) => working.appliedEventIds.includes(eventId),
      applyFact: async (fact, source): Promise<ReplenishedEventApplication> => {
        failIf("applyFact", source.eventId);
        if (this.notYetApplicable.has(source.eventId)) {
          return "not_yet_applicable";
        }
        working.facts.push({ fact, source });
        return "applied";
      },
      recordEventApplied: async (eventId) => {
        failIf("recordEventApplied", eventId);
        working.appliedEventIds.push(eventId);
      },
    };
    const outcome = await work(tx);
    this.state = working;
    return outcome;
  }

  async finish(): Promise<void> {
    failIfFinishing(this.failAt);
    this.state.predecessor = undefined;
  }
}

function failIfFinishing(failAt: FakeRegisterReplenishmentStore["failAt"]): void {
  if (failAt?.operation === "finish") {
    throw new Error("storage unavailable");
  }
}
