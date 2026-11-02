import type { OutboxEventDraft } from "../../../shared/index.js";
import type {
  ContingencyLedger,
  ContingencyLedgerTransaction,
  OpenContingencyInterval,
} from "../contingency-ledger.js";

interface RecordedContingencyInterval extends OpenContingencyInterval {
  endedAt: Date | null;
}

export interface FakeContingencyLedgerState {
  registerId: string | undefined;
  cashSessionOpen: boolean;
  intervals: RecordedContingencyInterval[];
  reportingStartedAt: Date | undefined;
  outbox: OutboxEventDraft[];
}

export type FakeContingencyLedgerWrite =
  | "recordOpenedInterval"
  | "recordIntervalSeen"
  | "recordClosedInterval"
  | "recordReportingStarted"
  | "appendOutboxEvent";

export class FakeContingencyLedger implements ContingencyLedger {
  state: FakeContingencyLedgerState;
  transactions = 0;
  failOn: FakeContingencyLedgerWrite | undefined;

  constructor(state: Partial<FakeContingencyLedgerState> = {}) {
    this.state = {
      registerId: "register-1",
      cashSessionOpen: true,
      intervals: [],
      reportingStartedAt: undefined,
      outbox: [],
      ...state,
    };
  }

  transaction<TOutcome>(work: (tx: ContingencyLedgerTransaction) => TOutcome): TOutcome {
    this.transactions += 1;
    const working = structuredClone(this.state);
    const outcome = work({
      registerId: () => working.registerId,
      cashSessionOpen: () => working.cashSessionOpen,
      openInterval: () => {
        const open = working.intervals.find((interval) => interval.endedAt === null);
        return open && { id: open.id, startedAt: open.startedAt, lastSeenAt: open.lastSeenAt };
      },
      reportingStartedAt: () => working.reportingStartedAt,
      recordOpenedInterval: ({ id, startedAt }) => {
        this.failIfAsked("recordOpenedInterval");
        working.intervals.push({ id, startedAt, lastSeenAt: startedAt, endedAt: null });
      },
      recordIntervalSeen: (intervalId, seenAt) => {
        this.failIfAsked("recordIntervalSeen");
        for (const interval of working.intervals) {
          if (interval.id === intervalId) {
            interval.lastSeenAt = seenAt;
          }
        }
      },
      recordClosedInterval: (intervalId, endedAt) => {
        this.failIfAsked("recordClosedInterval");
        for (const interval of working.intervals) {
          if (interval.id === intervalId) {
            interval.endedAt = endedAt;
          }
        }
      },
      recordReportingStarted: (since) => {
        this.failIfAsked("recordReportingStarted");
        working.reportingStartedAt = since;
      },
      appendOutboxEvent: (draft) => {
        this.failIfAsked("appendOutboxEvent");
        working.outbox.push(draft);
      },
    });
    this.state = working;
    return outcome;
  }

  private failIfAsked(write: FakeContingencyLedgerWrite): void {
    if (this.failOn === write) {
      throw new Error(`${write} failed`);
    }
  }
}
