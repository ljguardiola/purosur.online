import type { OutboxEventDraft } from "../../shared/index.js";

export const CONTINGENCY_ENTERED_EVENT_TYPE = "contingency_entered";
export const CONTINGENCY_LEFT_EVENT_TYPE = "contingency_left";
export const CONTINGENCY_REPORTING_STARTED_EVENT_TYPE = "contingency_reporting_started";

interface RegisterEventInput {
  eventId: string;
  registerId: string;
}

function registerEvent(
  { eventId, registerId }: RegisterEventInput,
  eventType: string,
  occurredAt: Date,
  payload: OutboxEventDraft["payload"],
): OutboxEventDraft {
  return {
    event_id: eventId,
    aggregate_type: "Register",
    aggregate_id: registerId,
    event_type: eventType,
    schema_version: 1,
    payload,
    occurred_at: occurredAt.toISOString(),
    actor_id: registerId,
  };
}

export function contingencyEnteredEvent(
  input: RegisterEventInput & { intervalId: string; startedAt: Date },
): OutboxEventDraft {
  return registerEvent(input, CONTINGENCY_ENTERED_EVENT_TYPE, input.startedAt, {
    interval_id: input.intervalId,
    started_at: input.startedAt.toISOString(),
  });
}

export function contingencyLeftEvent(
  input: RegisterEventInput & { intervalId: string; startedAt: Date; endedAt: Date },
): OutboxEventDraft {
  return registerEvent(input, CONTINGENCY_LEFT_EVENT_TYPE, input.endedAt, {
    interval_id: input.intervalId,
    started_at: input.startedAt.toISOString(),
    ended_at: input.endedAt.toISOString(),
  });
}

export function contingencyReportingStartedEvent(
  input: RegisterEventInput & { since: Date },
): OutboxEventDraft {
  return registerEvent(input, CONTINGENCY_REPORTING_STARTED_EVENT_TYPE, input.since, {
    since: input.since.toISOString(),
  });
}
