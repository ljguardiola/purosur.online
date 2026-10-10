import { quarantinedEventsListSchema } from "@purosur/contracts";
import { formatDate } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";
import { syncedAggregateTypeName, syncedEventTypeName } from "../platform/synced-event-names";
import type { QuarantinedEvent } from "./quarantined-events-api";

const SHORT_ID_LENGTH = 8;

const QUARANTINE_TIME_ZONE = schemaText(
  quarantinedEventsListSchema.shape.events.element.shape.quarantinedAt.meta()?.["timeZone"],
);

export function quarantinedEventSentenceText(eventType: string): string {
  return syncedEventTypeName(eventType) ?? eventType;
}

export function quarantinedEventColumnText(eventType: string): string {
  const name = syncedEventTypeName(eventType);
  return name === undefined
    ? eventType
    : `${name.charAt(0).toLocaleUpperCase("es-AR")}${name.slice(1)}`;
}

export function quarantinedRegisterText({
  aggregateType,
  aggregateId,
}: Pick<QuarantinedEvent, "aggregateType" | "aggregateId">): string {
  const shortId =
    aggregateId.length > SHORT_ID_LENGTH
      ? `${aggregateId.slice(0, SHORT_ID_LENGTH)}…`
      : aggregateId;
  return `${syncedAggregateTypeName(aggregateType) ?? aggregateType} ${shortId}`;
}

export function quarantinedDateTimeText(instant: string): string {
  return formatDate(new Date(instant), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: QUARANTINE_TIME_ZONE,
  });
}
