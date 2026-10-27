import type { AlertDetail } from "@purosur/contracts";
import { ofSyncedAggregate, syncedEventTypeName } from "../platform/synced-event-names";

type InvariantViolation = Extract<AlertDetail, { kind: "event_invariant_violated" }>["detail"];

const BREAK_DESCRIPTIONS: ReadonlyMap<string, string> = new Map([
  ["approved_payments_below_total", "los pagos aprobados no cubren el total de la venta"],
  ["refunds_do_not_match_payments", "los reembolsos no coinciden con los pagos de la venta"],
  [
    "stock_movements_do_not_match_lines",
    "los movimientos de stock no coinciden con los productos vendidos",
  ],
  [
    "return_refund_exceeds_payment",
    "la devolución reintegró más de lo que quedaba por devolver de un pago",
  ],
  ["return_line_outside_window", "la devolución incluye una línea fuera de su plazo"],
  ["return_quantity_exceeds_sale", "la devolución supera la cantidad vendida de una línea"],
]);

const UNKNOWN_BREAK = "otra inconsistencia";

const LIST_FORMAT = new Intl.ListFormat("es-AR", { type: "conjunction" });

function eventName({ eventType, eventId }: { eventType: string; eventId: string }): string {
  const typeName = syncedEventTypeName(eventType);
  return typeName === undefined ? `evento (${eventId})` : `evento de ${typeName} (${eventId})`;
}

export function quarantinedEventsDescription(registerName: string | null): string {
  const register = registerName === null ? "Una caja" : `La caja «${registerName}»`;
  return `${register} tiene eventos que no se pudieron aplicar y quedaron en cuarentena. Los eventos siguientes de cada uno de esos registros esperan hasta que se resuelvan.`;
}

export function invariantViolationDescription(detail: InvariantViolation): string {
  const breaks = new Set(
    detail.breaks.map((code) => BREAK_DESCRIPTIONS.get(code) ?? UNKNOWN_BREAK),
  );
  return `Se aplicó el ${eventName(detail)} ${ofSyncedAggregate(detail)}, pero tiene una inconsistencia: ${LIST_FORMAT.format(breaks)}.`;
}
