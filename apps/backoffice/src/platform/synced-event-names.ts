import type { SyncedEventPayloadKey } from "@purosur/contracts";

type SyncedEventType = SyncedEventPayloadKey extends `${infer EventType}@${string}`
  ? EventType
  : never;

const EVENT_TYPE_NAMES: Readonly<Record<SyncedEventType, string>> = {
  sale_completed: "venta",
  sale_cancelled: "venta cancelada",
  sale_print_state_changed: "impresión del ticket",
  reprint_recorded: "reimpresión del ticket",
  cash_session_opened: "apertura de caja",
  cash_session_closed: "cierre de caja",
  cash_movement_recorded: "movimiento de caja",
  fiscal_gate_failed: "control fiscal previo a facturar",
  qr_payment_replaced: "reemplazo de pago QR",
};

function isSyncedEventType(eventType: string): eventType is SyncedEventType {
  return Object.hasOwn(EVENT_TYPE_NAMES, eventType);
}

const AGGREGATE_TYPE_NAMES: ReadonlyMap<string, string> = new Map([
  ["Sale", "Venta"],
  ["CashSession", "Sesión de caja"],
]);

const OF_AGGREGATE_TYPE: ReadonlyMap<string, string> = new Map([
  ["Sale", "de la venta"],
  ["CashSession", "de la sesión de caja"],
]);

export function syncedEventTypeName(eventType: string): string | undefined {
  return isSyncedEventType(eventType) ? EVENT_TYPE_NAMES[eventType] : undefined;
}

export function ofSyncedAggregate({
  aggregateType,
  aggregateId,
}: {
  aggregateType: string;
  aggregateId: string;
}): string {
  return `${OF_AGGREGATE_TYPE.get(aggregateType) ?? "del registro"} ${aggregateId}`;
}

export function syncedAggregateTypeName(aggregateType: string): string | undefined {
  return AGGREGATE_TYPE_NAMES.get(aggregateType);
}
