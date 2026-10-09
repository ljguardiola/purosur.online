import type { EventQuarantineReason } from "../../alerts/index.js";
import { afterFailedAttempt } from "../model/event-application-retry.js";
import { nextEventToApply } from "../model/next-event-to-apply.js";
import { type AggregateKey, dependenciesOf, invariantBreaksOf } from "../model/synced-fact.js";
import type {
  ApplyPendingEventsPorts,
  EventApplicationTransaction,
  UnappliedEvent,
} from "./event-application-ports.js";

export interface ApplyPendingEventsInput {
  limit: number;
}

export type ApplyPendingEventsOutcome =
  | { kind: "idle" }
  | {
      kind: "processed";
      applied: number;
      flagged: number;
      retried: number;
      quarantined: number;
      busy: number;
      limitReached: boolean;
    };

type Step =
  | { kind: "busy" }
  | { kind: "nothing_due" }
  | { kind: "applied"; flagged: boolean }
  | { kind: "failed"; event: UnappliedEvent; failure: Failure }
  | { kind: "failure_recorded"; quarantined: boolean }
  | { kind: "failure_obsolete" };

interface Failure {
  reason: EventQuarantineReason;
  message: string;
}

class EventRefused extends Error {
  readonly reason: EventQuarantineReason;

  constructor(reason: EventQuarantineReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

class EventApplicationFailure extends Error {
  readonly event: UnappliedEvent;
  readonly failure: Failure;

  constructor(event: UnappliedEvent, failure: Failure) {
    super(failure.message);
    this.event = event;
    this.failure = failure;
  }
}

function failureOf(error: unknown): Failure {
  if (error instanceof EventRefused) {
    return { reason: error.reason, message: error.message };
  }
  return {
    reason: { kind: "not_recorded" },
    message: error instanceof Error ? error.message : String(error),
  };
}

async function applyEvent(
  ports: ApplyPendingEventsPorts,
  tx: EventApplicationTransaction,
  event: UnappliedEvent,
  now: Date,
): Promise<boolean> {
  const decoded = ports.upcaster.decode(event);
  if (decoded.kind === "unreadable") {
    throw new EventRefused({ kind: "unreadable" }, decoded.reason);
  }
  const { fact } = decoded;
  for (const dependency of dependenciesOf(fact)) {
    if (!(await tx.aggregateApplied(dependency))) {
      const { aggregateType, aggregateId } = dependency;
      throw new EventRefused(
        { kind: "missing_dependency", aggregateType, aggregateId },
        `depends on ${aggregateType} ${aggregateId} not applied yet`,
      );
    }
  }
  await tx.record(fact, event);
  if (fact.kind === "sale_completed" && fact.sale.stockMovements !== null) {
    const stock = await tx.applySaleStock(fact.sale, fact.sale.stockMovements, event);
    if (stock.kind === "refused") {
      throw new EventRefused({ kind: "not_recorded" }, stock.reason);
    }
  }
  await tx.markApplied(event.eventId, now);
  const breaks = invariantBreaksOf(fact);
  if (breaks.length > 0) {
    await tx.openInvariantAlert({
      eventId: event.eventId,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      breaks,
    });
  }
  return breaks.length > 0;
}

async function applyNextEvent(ports: ApplyPendingEventsPorts, key: AggregateKey): Promise<Step> {
  const now = ports.clock.now();
  try {
    return await ports.eventApplication.transaction(async (tx) => {
      if (!(await tx.lockAggregate(key))) {
        return { kind: "busy" };
      }
      const next = nextEventToApply(await tx.unappliedEventsOf(key), now);
      if (next.kind !== "due") {
        return { kind: "nothing_due" };
      }
      try {
        return { kind: "applied", flagged: await applyEvent(ports, tx, next.event, now) };
      } catch (error) {
        throw new EventApplicationFailure(next.event, failureOf(error));
      }
    });
  } catch (error) {
    if (error instanceof EventApplicationFailure) {
      return { kind: "failed", event: error.event, failure: error.failure };
    }
    throw error;
  }
}

async function recordFailure(
  ports: ApplyPendingEventsPorts,
  key: AggregateKey,
  { event, failure }: { event: UnappliedEvent; failure: Failure },
): Promise<Step> {
  const now = ports.clock.now();
  return ports.eventApplication.transaction(async (tx) => {
    if (!(await tx.lockAggregate(key))) {
      return { kind: "failure_obsolete" };
    }
    const next = nextEventToApply(await tx.unappliedEventsOf(key), now);
    if (next.kind !== "due" || next.event.eventId !== event.eventId) {
      return { kind: "failure_obsolete" };
    }
    const attempts = next.event.attempts + 1;
    const after = afterFailedAttempt(attempts, now);
    if (after.kind === "retry") {
      await tx.recordFailedAttempt(event.eventId, {
        attempts,
        nextAttemptAt: after.at,
        quarantinedAt: null,
        error: failure.message,
      });
      return { kind: "failure_recorded", quarantined: false };
    }
    await tx.recordFailedAttempt(event.eventId, {
      attempts,
      nextAttemptAt: null,
      quarantinedAt: now,
      error: failure.message,
    });
    await tx.openQuarantineAlert({
      deviceId: next.event.deviceId,
      eventId: next.event.eventId,
      eventType: next.event.eventType,
      aggregateType: next.event.aggregateType,
      aggregateId: next.event.aggregateId,
      reason: failure.reason,
    });
    return { kind: "failure_recorded", quarantined: true };
  });
}

export async function applyPendingEvents(
  ports: ApplyPendingEventsPorts,
  input: ApplyPendingEventsInput,
): Promise<ApplyPendingEventsOutcome> {
  let attempted = 0;
  let applied = 0;
  let flagged = 0;
  let retried = 0;
  let quarantined = 0;
  let busy = 0;
  for (const key of await ports.eventApplication.pendingAggregates()) {
    let aggregateDone = false;
    while (!aggregateDone && attempted < input.limit) {
      const step = await applyNextEvent(ports, key);
      if (step.kind === "busy") {
        aggregateDone = true;
        busy += 1;
      } else if (step.kind === "nothing_due") {
        aggregateDone = true;
      } else if (step.kind === "applied") {
        attempted += 1;
        applied += 1;
        flagged += step.flagged ? 1 : 0;
      } else if (step.kind === "failed") {
        attempted += 1;
        aggregateDone = true;
        const recorded = await recordFailure(ports, key, step);
        if (recorded.kind === "failure_recorded") {
          retried += recorded.quarantined ? 0 : 1;
          quarantined += recorded.quarantined ? 1 : 0;
        }
      }
    }
  }
  if (attempted === 0 && busy === 0) {
    return { kind: "idle" };
  }
  return {
    kind: "processed",
    applied,
    flagged,
    retried,
    quarantined,
    busy,
    limitReached: attempted >= input.limit,
  };
}
