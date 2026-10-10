import type { AlertDetail } from "@purosur/contracts";
import { ofSyncedAggregateType, syncedEventTypeName } from "../platform/synced-event-names";

type QuarantinedEvent = Extract<AlertDetail, { kind: "events_quarantined" }>["detail"];
type InvariantViolation = Extract<AlertDetail, { kind: "event_invariant_violated" }>["detail"];
type QuarantineReason = QuarantinedEvent["reason"];

const BREAK_DESCRIPTIONS: ReadonlyMap<string, string> = new Map([
  ["approved_payments_below_total", "los pagos aprobados no cubren el total de la venta"],
  ["refunds_do_not_match_payments", "los reembolsos no coinciden con los pagos de la venta"],
  [
    "stock_movements_do_not_match_lines",
    "los movimientos de stock no coinciden con los productos vendidos",
  ],
]);

const UNKNOWN_BREAK = "otra inconsistencia";

const LIST_FORMAT = new Intl.ListFormat("es-AR", { type: "conjunction" });

function eventName({ eventType, eventId }: { eventType: string; eventId: string }): string {
  const typeName = syncedEventTypeName(eventType);
  return typeName === undefined ? `evento (${eventId})` : `evento de ${typeName} (${eventId})`;
}

function ofAggregate({
  aggregateType,
  aggregateId,
}: {
  aggregateType: string;
  aggregateId: string;
}): string {
  return `${ofSyncedAggregateType(aggregateType) ?? "del registro"} ${aggregateId}`;
}

function reasonText(reason: QuarantineReason): string {
  switch (reason.kind) {
    case "unreadable":
      return "la nube no puede leer lo que envió la caja";
    case "missing_dependency":
      return `depende ${ofAggregate(reason)}, que todavía no se aplicó`;
    case "not_recorded":
      return "la nube no lo pudo guardar";
  }
}

export function quarantinedEventDescription(detail: QuarantinedEvent): string {
  const aggregate = ofAggregate(detail);
  return `El ${eventName(detail)} ${aggregate} no se pudo aplicar y quedó en cuarentena: ${reasonText(detail.reason)}. Los eventos siguientes ${aggregate} esperan hasta que se resuelva.`;
}

export function invariantViolationDescription(detail: InvariantViolation): string {
  const breaks = new Set(
    detail.breaks.map((code) => BREAK_DESCRIPTIONS.get(code) ?? UNKNOWN_BREAK),
  );
  return `Se aplicó el ${eventName(detail)} ${ofAggregate(detail)}, pero tiene una inconsistencia: ${LIST_FORMAT.format(breaks)}.`;
}
