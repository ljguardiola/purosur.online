import type {
  EventInvariantViolatedDetail,
  EventsQuarantinedDetail,
} from "../../../alerts/index.js";
import type { CompletedSale } from "../../../sales/index.js";
import type { SyncedFact } from "../../model/synced-fact.js";
import type {
  AggregateKey,
  EventApplication,
  EventApplicationTransaction,
  EventUpcaster,
  FailedAttempt,
  UnappliedEvent,
} from "../event-application-ports.js";

export interface FakeStoredEvent extends UnappliedEvent {
  appliedAt: Date | null;
  error: string | null;
}

export interface FakeEventApplicationState {
  events: FakeStoredEvent[];
  recorded: { fact: SyncedFact; eventId: string }[];
  stockApplied: { eventId: string; saleId: string }[];
  writeOrder: string[];
  appliedOrder: string[];
  quarantineAlerts: EventsQuarantinedDetail[];
  invariantAlerts: EventInvariantViolatedDetail[];
}

const keyOf = (key: AggregateKey) => `${key.aggregateType}/${key.aggregateId}`;

export function aStoredEvent(
  overrides: Partial<FakeStoredEvent> & { eventId: string },
): FakeStoredEvent {
  return {
    deviceId: "device-1",
    deviceSeq: 1,
    aggregateType: "Sale",
    aggregateId: "sale-1",
    eventType: "sale_completed",
    schemaVersion: 2,
    payload: {},
    occurredAt: new Date("2026-10-07T10:00:00.000Z"),
    receivedAt: new Date("2026-10-07T10:00:05.000Z"),
    actorId: "cashier-1",
    quarantinedAt: null,
    nextAttemptAt: null,
    attempts: 0,
    appliedAt: null,
    error: null,
    ...overrides,
  };
}

export class FakeEventApplication implements EventApplication {
  state: FakeEventApplicationState = {
    events: [],
    recorded: [],
    stockApplied: [],
    writeOrder: [],
    appliedOrder: [],
    quarantineAlerts: [],
    invariantAlerts: [],
  };
  calls: string[] = [];
  transactions = 0;
  failRecording = new Map<string, unknown>();
  refuseStock = new Map<string, string>();
  failOpeningInvariantAlert = false;
  heldByAnotherRun = new Set<string>();
  beforeTransaction: (transactionNumber: number) => void = () => {};

  constructor(events: FakeStoredEvent[] = []) {
    this.state.events = events;
  }

  holdAggregateAsAnotherRun(key: AggregateKey): void {
    this.heldByAnotherRun.add(keyOf(key));
  }

  get appliedEventIds(): string[] {
    return this.state.appliedOrder.filter((eventId) => this.event(eventId).appliedAt !== null);
  }

  event(eventId: string): FakeStoredEvent {
    const found = this.state.events.find((event) => event.eventId === eventId);
    if (found === undefined) {
      throw new Error(`no event ${eventId}`);
    }
    return found;
  }

  async pendingAggregates(): Promise<AggregateKey[]> {
    const seen = new Map<string, AggregateKey>();
    for (const event of this.state.events) {
      if (event.appliedAt === null) {
        const key = { aggregateType: event.aggregateType, aggregateId: event.aggregateId };
        seen.set(keyOf(key), key);
      }
    }
    return [...seen.values()];
  }

  async transaction<T>(work: (tx: EventApplicationTransaction) => Promise<T>): Promise<T> {
    this.transactions += 1;
    this.beforeTransaction(this.transactions);
    const snapshot = structuredClone(this.state);
    this.calls.push("begin");
    try {
      const result = await work(this.transactionObject());
      this.calls.push("commit");
      return result;
    } catch (error) {
      this.state = snapshot;
      this.calls.push("rollback");
      throw error;
    }
  }

  private transactionObject(): EventApplicationTransaction {
    return {
      lockAggregate: async (key) => {
        this.calls.push(`lock ${keyOf(key)}`);
        return !this.heldByAnotherRun.has(keyOf(key));
      },
      unappliedEventsOf: async (key) => {
        this.calls.push(`read ${keyOf(key)}`);
        return this.state.events.filter(
          (event) => keyOf(event) === keyOf(key) && event.appliedAt === null,
        );
      },
      aggregateApplied: async (key) => {
        this.calls.push(`check ${keyOf(key)}`);
        return this.state.events.some(
          (event) => keyOf(event) === keyOf(key) && event.appliedAt !== null,
        );
      },
      record: async (fact, event) => {
        this.state.recorded.push({ fact, eventId: event.eventId });
        this.state.writeOrder.push("record");
        const failure = this.failRecording.get(event.eventId);
        if (failure !== undefined) {
          throw failure;
        }
      },
      applySaleStock: async (sale: CompletedSale, _movements, event) => {
        this.state.writeOrder.push("stock");
        const refusal = this.refuseStock.get(event.eventId);
        if (refusal !== undefined) {
          return { kind: "refused", reason: refusal };
        }
        this.state.stockApplied.push({ eventId: event.eventId, saleId: sale.id });
        return { kind: "applied" };
      },
      markApplied: async (eventId, at) => {
        this.event(eventId).appliedAt = at;
        this.state.appliedOrder.push(eventId);
      },
      recordFailedAttempt: async (eventId, failed: FailedAttempt) => {
        Object.assign(this.event(eventId), failed);
      },
      openQuarantineAlert: async (details) => {
        this.state.quarantineAlerts.push(details);
      },
      openInvariantAlert: async (details) => {
        if (this.failOpeningInvariantAlert) {
          throw new Error("alert store unavailable");
        }
        this.state.invariantAlerts.push(details);
      },
    };
  }
}

export class FakeEventUpcaster implements EventUpcaster {
  private readonly facts: ReadonlyMap<string, SyncedFact>;
  readonly unreadableReason = "no schema reads this payload";

  constructor(facts: Record<string, SyncedFact>) {
    this.facts = new Map(Object.entries(facts));
  }

  decode(event: { eventId: string }) {
    const fact = this.facts.get(event.eventId);
    return fact === undefined
      ? ({ kind: "unreadable", reason: this.unreadableReason } as const)
      : ({ kind: "fact", fact } as const);
  }
}
