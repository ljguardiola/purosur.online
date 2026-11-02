import type { OutboxEventDraft } from "../../shared/index.js";

export interface OpenContingencyInterval {
  id: string;
  startedAt: Date;
  lastSeenAt: Date;
}

export interface ContingencyLedger {
  transaction<TOutcome>(work: (tx: ContingencyLedgerTransaction) => TOutcome): TOutcome;
}

export interface ContingencyLedgerTransaction {
  registerId(): string | undefined;
  cashSessionOpen(): boolean;
  openInterval(): OpenContingencyInterval | undefined;
  reportingStartedAt(): Date | undefined;
  recordOpenedInterval(interval: { id: string; startedAt: Date }): void;
  recordIntervalSeen(intervalId: string, seenAt: Date): void;
  recordClosedInterval(intervalId: string, endedAt: Date): void;
  recordReportingStarted(since: Date): void;
  appendOutboxEvent(draft: OutboxEventDraft): void;
}
