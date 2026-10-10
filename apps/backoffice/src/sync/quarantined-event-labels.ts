import { type EventQuarantineReason, quarantinedEventsListSchema } from "@purosur/contracts";
import { formatDate } from "@purosur/ui";
import { eventQuarantineReasonText } from "../platform/event-quarantine-reason-text";
import { schemaText } from "../platform/schema-text";
import { syncedAggregateTypeName, syncedEventTypeName } from "../platform/synced-event-names";
import type { QuarantinedEvent } from "./quarantined-events-api";

const SHORT_ID_LENGTH = 8;

const QUARANTINE_TIME_ZONE = schemaText(
  quarantinedEventsListSchema.shape.events.element.shape.quarantinedAt.meta()?.["timeZone"],
);

function capitalized(text: string): string {
  return `${text.charAt(0).toLocaleUpperCase("es-AR")}${text.slice(1)}`;
}

export function quarantinedEventSentenceText(eventType: string): string {
  const name = syncedEventTypeName(eventType);
  return name === undefined ? "evento" : `evento de ${name}`;
}

export function quarantinedEventColumnText(eventType: string): string {
  const name = syncedEventTypeName(eventType);
  return name === undefined ? "Desconocido" : capitalized(name);
}

export function quarantinedReasonText(reason: EventQuarantineReason | null): string {
  return reason === null ? "—" : capitalized(eventQuarantineReasonText(reason));
}

export function quarantinedRegisterText({
  aggregateType,
  aggregateId,
}: Pick<QuarantinedEvent, "aggregateType" | "aggregateId">): string {
  const shortId =
    aggregateId.length > SHORT_ID_LENGTH
      ? `${aggregateId.slice(0, SHORT_ID_LENGTH)}…`
      : aggregateId;
  return `${syncedAggregateTypeName(aggregateType) ?? "Registro"} ${shortId}`;
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
