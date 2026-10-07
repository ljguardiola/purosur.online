import {
  cashMovementRecordedSchema,
  cashSessionClosedSchema,
  cashSessionOpenedSchema,
  fiscalGateFailedSchema,
  saleCompletedV1Schema,
  saleCompletedV2Schema,
} from "@purosur/contracts";
import type {
  DecodedEvent,
  EventUpcaster,
  SyncedFact,
  UnappliedEvent,
} from "@purosur/domain/sync/use-cases";
import type { z } from "zod";

type SaleFields = z.output<typeof saleCompletedV2Schema>;
type SalePayment = z.output<typeof saleCompletedV1Schema>["payments"][number];

function completedSale(
  payload: SaleFields | z.output<typeof saleCompletedV1Schema>,
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

type Reader = (event: UnappliedEvent) => DecodedEvent;

function reader<TSchema extends z.ZodType>(
  schema: TSchema,
  toFact: (payload: z.output<TSchema>, event: UnappliedEvent) => SyncedFact,
): Reader {
  return (event) => {
    const parsed = schema.safeParse(event.payload);
    if (!parsed.success) {
      const reason = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
        .join("; ");
      return { kind: "unreadable", reason };
    }
    return { kind: "fact", fact: toFact(parsed.data, event) };
  };
}

const READERS = new Map<string, Reader>([
  [
    "sale_completed@1",
    reader(saleCompletedV1Schema, (payload) =>
      completedSale(payload, payload.completed_at, payload.payments),
    ),
  ],
  [
    "sale_completed@2",
    reader(saleCompletedV2Schema, (payload) =>
      completedSale(payload, payload.occurred_at, payload.payments),
    ),
  ],
  [
    "cash_session_opened@1",
    reader(cashSessionOpenedSchema, (payload, event) => ({
      kind: "cash_session_opened",
      session: {
        id: event.aggregateId,
        openedBy: payload.opened_by,
        openedAt: new Date(payload.opened_at),
        openingFloat: payload.opening_float,
      },
    })),
  ],
  [
    "cash_session_closed@1",
    reader(cashSessionClosedSchema, (payload, event) => ({
      kind: "cash_session_closed",
      session: {
        id: event.aggregateId,
        closedBy: payload.closed_by,
        closedAt: new Date(payload.closed_at),
        expectedCash: payload.expected_cash,
        countedCash: payload.counted_cash,
        difference: payload.difference,
      },
    })),
  ],
  [
    "cash_movement_recorded@1",
    reader(cashMovementRecordedSchema, (payload, event) => ({
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
    })),
  ],
  [
    "fiscal_gate_failed@1",
    reader(fiscalGateFailedSchema, (payload) => ({
      kind: "fiscal_gate_failed",
      gateFailure: {
        saleId: payload.sale_id,
        reason: payload.reason,
        evaluatedAt: new Date(payload.evaluated_at),
      },
    })),
  ],
]);

export const syncedEventUpcaster: EventUpcaster = {
  decode(event) {
    const read = READERS.get(`${event.eventType}@${event.schemaVersion}`);
    if (read === undefined) {
      return {
        kind: "unreadable",
        reason: `no schema reads ${event.eventType} version ${event.schemaVersion}`,
      };
    }
    return read(event);
  },
};
