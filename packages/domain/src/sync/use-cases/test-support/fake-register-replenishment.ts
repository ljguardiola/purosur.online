import type { RestoredCreditNoteAnswer, SaleVoidCreditNote } from "../../../fiscal/index.js";
import type { ReplenishedUser } from "../../../users/index.js";
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
import type { EventPosition, ReplenishedEvent } from "../restored-register-replenishment-ports.js";

interface AppliedFact {
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
  creditNoteAnswers: RestoredCreditNoteAnswer[] = [],
): RegisterReplenishmentFeedAnswer<FakeFailure> {
  const page: ReplenishmentPage = { events, users, next, creditNoteAnswers };
  return { kind: "page", page };
}

export function aUser(userId: string): ReplenishedUser {
  return {
    userId,
    firstName: `Name of ${userId}`,
    roleId: "role-1",
    salt: "salt",
    pinHash: "hash",
    active: true,
    version: 1,
  };
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

interface RecordedCreditNoteAnswer {
  creditNote: SaleVoidCreditNote;
  answer: RestoredCreditNoteAnswer;
}

export interface ReplenishingRegisterState {
  predecessor: RegisterPredecessor | undefined;
  users: ReplenishedUser[][];
  facts: AppliedFact[];
  appliedEventIds: string[];
  creditNoteAnswers: RecordedCreditNoteAnswer[];
}

export type FakeStoreOperation =
  | "applyUsers"
  | "applyFact"
  | "recordCreditNoteAnswer"
  | "recordEventApplied"
  | "finish";

export class FakeRegisterReplenishmentStore implements RegisterReplenishmentStore {
  state: ReplenishingRegisterState;
  transactions = 0;
  notYetApplicable = new Set<string>();
  failAt: { operation: FakeStoreOperation; eventId?: string } | undefined;

  constructor(predecessor: RegisterPredecessor | undefined) {
    this.state = { predecessor, users: [], facts: [], appliedEventIds: [], creditNoteAnswers: [] };
  }

  async predecessor(): Promise<RegisterPredecessor | undefined> {
    return this.state.predecessor;
  }

  async applyUsers(users: readonly ReplenishedUser[]): Promise<void> {
    if (this.failAt?.operation === "applyUsers") {
      throw new Error("storage unavailable");
    }
    this.state.users.push(structuredClone([...users]));
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
      eventApplied: async (eventId) => working.appliedEventIds.includes(eventId),
      applyFact: async (fact, source): Promise<ReplenishedEventApplication> => {
        failIf("applyFact", source.eventId);
        if (this.notYetApplicable.has(source.eventId)) {
          return "not_yet_applicable";
        }
        working.facts.push({ fact, source });
        return "applied";
      },
      recordCreditNoteAnswer: async (creditNote, answer) => {
        failIf("recordCreditNoteAnswer");
        const saleIsVoided = working.facts.some(
          ({ fact }) => fact.kind === "sale_voided" && fact.sale.id === creditNote.saleId,
        );
        if (!saleIsVoided) {
          throw new Error(`the register holds no voided sale ${creditNote.saleId}`);
        }
        working.creditNoteAnswers.push({ creditNote, answer });
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
