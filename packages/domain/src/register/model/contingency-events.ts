import type { OutboxEventDraft } from "../../shared/index.js";

interface RegisterEventInput {
  eventId: string;
  registerId: string;
}

export function contingencyEnteredEvent({
  eventId,
  registerId,
  intervalId,
  startedAt,
}: RegisterEventInput & { intervalId: string; startedAt: Date }): OutboxEventDraft {
  const startedAtIso = startedAt.toISOString();
  return {
    event_id: eventId,
    aggregate_type: "Register",
    aggregate_id: registerId,
    event_type: "contingency_entered",
    schema_version: 1,
    payload: { interval_id: intervalId, started_at: startedAtIso },
    occurred_at: startedAtIso,
    actor_id: registerId,
  };
}

export function contingencyLeftEvent({
  eventId,
  registerId,
  intervalId,
  startedAt,
  endedAt,
}: RegisterEventInput & {
  intervalId: string;
  startedAt: Date;
  endedAt: Date;
}): OutboxEventDraft {
  const endedAtIso = endedAt.toISOString();
  return {
    event_id: eventId,
    aggregate_type: "Register",
    aggregate_id: registerId,
    event_type: "contingency_left",
    schema_version: 1,
    payload: {
      interval_id: intervalId,
      started_at: startedAt.toISOString(),
      ended_at: endedAtIso,
    },
    occurred_at: endedAtIso,
    actor_id: registerId,
  };
}

export function contingencyReportingStartedEvent({
  eventId,
  registerId,
  since,
}: RegisterEventInput & { since: Date }): OutboxEventDraft {
  const sinceIso = since.toISOString();
  return {
    event_id: eventId,
    aggregate_type: "Register",
    aggregate_id: registerId,
    event_type: "contingency_reporting_started",
    schema_version: 1,
    payload: { since: sinceIso },
    occurred_at: sinceIso,
    actor_id: registerId,
  };
}
