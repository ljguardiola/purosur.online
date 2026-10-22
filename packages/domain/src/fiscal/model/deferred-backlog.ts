import { argentinaCalendarDay } from "../../shared/index.js";
import { isDeferredSaleExpired } from "./deferred-sale-expiry.js";

export const DEFERRED_BACKLOG_RETRY_INTERVAL_MS = 10 * 60_000;

export interface DeferredBacklogEntry {
  deferredSaleId: string;
  saleId: string;
  occurredAt: Date;
  routedAt: Date;
  total: number;
  lastAttemptEndedAt: Date | null;
}

export type DeferredBacklogStep =
  | { kind: "empty" }
  | { kind: "wait"; until: Date }
  | { kind: "invoice"; entry: DeferredBacklogEntry };

export function isDateOrderBroken(
  occurredAt: Date,
  lastAuthorizedIssuedOn: string | null,
): boolean {
  return (
    lastAuthorizedIssuedOn !== null && argentinaCalendarDay(occurredAt) < lastAuthorizedIssuedOn
  );
}

export function latestIssuedOn(a: string | null, b: string | null): string | null {
  const knownDays = [a, b].filter((day) => day !== null).sort();
  return knownDays.at(-1) ?? null;
}

export function isInDeferredBacklog(
  entry: DeferredBacklogEntry,
  now: Date,
  lastAuthorizedIssuedOn: string | null,
): boolean {
  return (
    !isDeferredSaleExpired(entry.occurredAt, now) &&
    !isDateOrderBroken(entry.occurredAt, lastAuthorizedIssuedOn)
  );
}

export function hasDeferredBacklog(
  entries: readonly DeferredBacklogEntry[],
  now: Date,
  lastAuthorizedIssuedOn: string | null,
): boolean {
  return entries.some((entry) => isInDeferredBacklog(entry, now, lastAuthorizedIssuedOn));
}

function compareBacklogOrder(a: DeferredBacklogEntry, b: DeferredBacklogEntry): number {
  if (a.occurredAt.getTime() !== b.occurredAt.getTime()) {
    return a.occurredAt.getTime() - b.occurredAt.getTime();
  }
  if (a.routedAt.getTime() !== b.routedAt.getTime()) {
    return a.routedAt.getTime() - b.routedAt.getTime();
  }
  const [firstId] = [a.deferredSaleId, b.deferredSaleId].sort();
  return firstId === a.deferredSaleId ? -1 : 1;
}

export function nextDeferredBacklogStep(
  entries: readonly DeferredBacklogEntry[],
  now: Date,
  lastAuthorizedIssuedOn: string | null,
): DeferredBacklogStep {
  const [first] = entries
    .filter((entry) => isInDeferredBacklog(entry, now, lastAuthorizedIssuedOn))
    .sort(compareBacklogOrder);
  if (first === undefined) {
    return { kind: "empty" };
  }
  if (first.lastAttemptEndedAt !== null) {
    const until = new Date(first.lastAttemptEndedAt.getTime() + DEFERRED_BACKLOG_RETRY_INTERVAL_MS);
    if (now.getTime() < until.getTime()) {
      return { kind: "wait", until };
    }
  }
  return { kind: "invoice", entry: first };
}
