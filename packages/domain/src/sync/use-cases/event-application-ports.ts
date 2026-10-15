import type { MercadoPagoOrderTransaction } from "../../payments/index.js";
import type { CompletedSale, VoidedSale } from "../../sales/index.js";
import type { Clock, JsonValue } from "../../shared/index.js";
import type { OpeningCountRecordedFact, OpeningCountWithdrawnFact } from "../../stock/index.js";
import type { EventInvariantBreaks } from "../model/event-invariant-breaks.js";
import type { EventQuarantine } from "../model/event-quarantine.js";
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

export type StockApplication = { kind: "applied" } | { kind: "refused"; reason: string };

export type ProviderTransactionOfPayment = Pick<
  MercadoPagoOrderTransaction,
  "saleId" | "amount" | "state" | "method"
>;

export interface EventApplicationTransaction {
  lockAggregate(key: AggregateKey): Promise<boolean>;
  unappliedEventsOf(key: AggregateKey): Promise<UnappliedEvent[]>;
  aggregateApplied(key: AggregateKey): Promise<boolean>;
  providerTransactionOfPayment(paymentId: string): Promise<ProviderTransactionOfPayment | null>;
  record(fact: SyncedFact, event: UnappliedEvent): Promise<void>;
  applySaleStock(
    sale: CompletedSale,
    movements: NonNullable<CompletedSale["stockMovements"]>,
    event: UnappliedEvent,
  ): Promise<StockApplication>;
  applySaleVoidStock(
    sale: VoidedSale,
    movements: VoidedSale["stockMovements"],
    event: UnappliedEvent,
  ): Promise<StockApplication>;
  applyOpeningCount(
    count: OpeningCountRecordedFact,
    event: UnappliedEvent,
  ): Promise<StockApplication>;
  withdrawOpeningCount(
    withdrawal: OpeningCountWithdrawnFact,
    event: UnappliedEvent,
  ): Promise<StockApplication>;
  markApplied(eventId: string, at: Date): Promise<void>;
  recordFailedAttempt(eventId: string, failed: FailedAttempt): Promise<void>;
  lockDeviceQuarantines(deviceId: string): Promise<void>;
  recordQuarantine(quarantine: EventQuarantine): Promise<void>;
  recordInvariantBreaks(found: EventInvariantBreaks): Promise<void>;
}

export interface EventApplication {
  pendingAggregates(): Promise<AggregateKey[]>;
  reasonOf(error: unknown): string;
  transaction<T>(work: (tx: EventApplicationTransaction) => Promise<T>): Promise<T>;
}

export type DecodedEvent =
  | { kind: "fact"; fact: SyncedFact }
  | { kind: "unreadable"; reason: string };

export interface EventUpcaster {
  decode(event: UnappliedEvent): DecodedEvent;
}

export interface QuarantinedEvent {
  deviceId: string;
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  error: string;
}

export interface QuarantineNotices {
  quarantined(event: QuarantinedEvent): void;
}

export interface ApplyPendingEventsPorts {
  eventApplication: EventApplication;
  upcaster: EventUpcaster;
  clock: Clock;
  quarantineNotices: QuarantineNotices;
}
