import {
  type SyncedEventPayloadKey,
  type SyncedEventPayloads,
  syncedEventPayloadKey,
  syncedEventPayloadSchema,
} from "@purosur/contracts";
import type {
  DecodedEvent,
  EventUpcaster,
  SyncedFact,
  UnappliedEvent,
} from "@purosur/domain/sync/use-cases";

type CompletedSalePayload = SyncedEventPayloads["sale_completed@1" | "sale_completed@2"];
type SalePayment = SyncedEventPayloads["sale_completed@1"]["payments"][number];

function completedSale(
  payload: CompletedSalePayload,
  completedAt: string,
  payments: readonly SalePayment[],
): SyncedFact {
  return {
    kind: "sale_completed",
    sale: {
      id: payload.id,
      sessionId: payload.session_id,
      actorId: payload.actor_id,
      completedAt: new Date(completedAt),
      total: payload.total,
      lines: payload.lines.map((line) => ({
        id: line.id,
        productId: line.product_id,
        productName: line.product_name,
        quantity: line.quantity,
        listUnitPrice: line.list_unit_price,
        priceListId: line.price_list_id,
        promotionId: line.promotion_id,
        discountAmount: line.discount_amount,
        lineTotal: line.line_total,
      })),
      payments: payments.map((payment) => ({
        id: payment.id,
        method: payment.method,
        provider: payment.provider,
        amount: payment.amount,
        tendered: payment.tendered,
        state: payment.state,
        occurredAt: new Date(payment.occurred_at),
        authorizedBy: payment.authorized_by ?? null,
        confirmedAt: payment.confirmed_at ? new Date(payment.confirmed_at) : null,
      })),
      cashMovements: payload.cash_movements.map((movement) => ({
        id: movement.id,
        type: movement.type,
        amount: movement.amount,
        actorId: movement.actor_id,
        occurredAt: new Date(movement.occurred_at),
      })),
    },
  };
}

const FACT_OF: {
  [Key in SyncedEventPayloadKey]: (
    payload: SyncedEventPayloads[Key],
    event: UnappliedEvent,
  ) => SyncedFact;
} = {
  "sale_completed@1": (payload) => completedSale(payload, payload.completed_at, payload.payments),
  "sale_completed@2": (payload) => completedSale(payload, payload.occurred_at, payload.payments),
  "cash_session_opened@1": (payload, event) => ({
    kind: "cash_session_opened",
    session: {
      id: event.aggregateId,
      openedBy: payload.opened_by,
      openedAt: new Date(payload.opened_at),
      openingFloat: payload.opening_float,
    },
  }),
  "cash_session_closed@1": (payload, event) => ({
    kind: "cash_session_closed",
    session: {
      id: event.aggregateId,
      closedBy: payload.closed_by,
      closedAt: new Date(payload.closed_at),
      expectedCash: payload.expected_cash,
      countedCash: payload.counted_cash,
      difference: payload.difference,
    },
  }),
  "cash_movement_recorded@1": (payload, event) => ({
    kind: "cash_movement_recorded",
    movement: {
      sessionId: event.aggregateId,
      type: payload.type,
      amount: payload.amount,
      reason: payload.reason,
      refType: payload.ref_type,
      refId: payload.ref_id,
      actorId: payload.actor_id,
      authorizedBy: payload.authorized_by,
      occurredAt: new Date(payload.occurred_at),
    },
  }),
  "fiscal_gate_failed@1": (payload) => ({
    kind: "fiscal_gate_failed",
    gateFailure: {
      saleId: payload.sale_id,
      reason: payload.reason,
      evaluatedAt: new Date(payload.evaluated_at),
    },
  }),
};

function decodeAs<Key extends SyncedEventPayloadKey>(
  key: Key,
  event: UnappliedEvent,
): DecodedEvent {
  const parsed = syncedEventPayloadSchema(key).safeParse(event.payload);
  if (!parsed.success) {
    const reason = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
      .join("; ");
    return { kind: "unreadable", reason };
  }
  return { kind: "fact", fact: FACT_OF[key](parsed.data, event) };
}

export const syncedEventUpcaster: EventUpcaster = {
  decode(event) {
    const key = syncedEventPayloadKey(event.eventType, event.schemaVersion);
    if (key === undefined) {
      return {
        kind: "unreadable",
        reason: `no schema reads ${event.eventType} version ${event.schemaVersion}`,
      };
    }
    return decodeAs(key, event);
  },
};
