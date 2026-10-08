import type { AlertDetail } from "@purosur/contracts";

type QuarantinedEvent = Extract<AlertDetail, { kind: "events_quarantined" }>["detail"];
type InvariantViolation = Extract<AlertDetail, { kind: "event_invariant_violated" }>["detail"];
type QuarantineReason = QuarantinedEvent["reason"];

const EVENT_TYPE_NAMES: ReadonlyMap<string, string> = new Map([
  ["sale_completed", "venta"],
  ["cash_session_opened", "apertura de caja"],
  ["cash_session_closed", "cierre de caja"],
  ["cash_movement_recorded", "movimiento de caja"],
  ["fiscal_gate_failed", "control fiscal previo a facturar"],
]);

const OF_AGGREGATE_TYPE: ReadonlyMap<string, string> = new Map([
  ["Sale", "de la venta"],
  ["CashSession", "de la sesión de caja"],
]);

const BREAK_DESCRIPTIONS: ReadonlyMap<string, string> = new Map([
  ["approved_payments_below_total", "los pagos aprobados no cubren el total de la venta"],
]);

const UNKNOWN_BREAK = "otra inconsistencia";

const LIST_FORMAT = new Intl.ListFormat("es-AR", { type: "conjunction" });

function eventName({ eventType, eventId }: { eventType: string; eventId: string }): string {
  const typeName = EVENT_TYPE_NAMES.get(eventType);
  return typeName === undefined ? `evento (${eventId})` : `evento de ${typeName} (${eventId})`;
}

function ofAggregate({
  aggregateType,
  aggregateId,
}: {
  aggregateType: string;
  aggregateId: string;
}): string {
  return `${OF_AGGREGATE_TYPE.get(aggregateType) ?? "del registro"} ${aggregateId}`;
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
