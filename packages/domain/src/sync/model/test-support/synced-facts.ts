import type { SyncedFact } from "../synced-fact.js";

type SaleCompleted = Extract<SyncedFact, { kind: "sale_completed" }>;

export function aCompletedSaleFact(overrides: Partial<SaleCompleted["sale"]> = {}): SaleCompleted {
  return {
    kind: "sale_completed",
    sale: {
      id: "sale-1",
      sessionId: "session-1",
      actorId: "cashier-1",
      completedAt: new Date("2026-10-07T10:00:00.000Z"),
      total: 1500,
      lines: [
        {
          id: "line-1",
          productId: "product-1",
          productName: "Yerba mate 1 kg",
          quantity: 1,
          listUnitPrice: 1500,
          priceListId: "price-list-1",
          promotionId: null,
          discountAmount: 0,
          lineTotal: 1500,
        },
      ],
      payments: [
        {
          id: "payment-1",
          method: "CASH",
          provider: "NONE",
          amount: 1500,
          tendered: 2000,
          state: "APPROVED",
          occurredAt: new Date("2026-10-07T10:00:00.000Z"),
          authorizedBy: null,
          confirmedAt: null,
        },
      ],
      cashMovements: [
        {
          id: "movement-1",
          type: "SALE",
          amount: 1500,
          actorId: "cashier-1",
          occurredAt: new Date("2026-10-07T10:00:00.000Z"),
        },
      ],
      ...overrides,
    },
  };
}

type SaleCancelled = Extract<SyncedFact, { kind: "sale_cancelled" }>;

export function aCancelledSaleFact(overrides: Partial<SaleCancelled["sale"]> = {}): SaleCancelled {
  return {
    kind: "sale_cancelled",
    sale: {
      id: "sale-1",
      sessionId: "session-1",
      actorId: "cashier-1",
      authorizedBy: "supervisor-1",
      cancelledAt: new Date("2026-10-07T10:05:00.000Z"),
      total: 3000,
      lines: [
        {
          id: "line-1",
          productId: "product-1",
          productName: "Yerba mate 1 kg",
          quantity: 2,
          listUnitPrice: 1500,
          priceListId: "price-list-1",
          promotionId: null,
          discountAmount: 0,
          lineTotal: 3000,
        },
      ],
      payments: [
        {
          id: "payment-1",
          method: "CASH",
          provider: "NONE",
          amount: 1000,
          tendered: 1000,
          state: "APPROVED",
          occurredAt: new Date("2026-10-07T10:01:00.000Z"),
          authorizedBy: null,
          confirmedAt: null,
        },
      ],
      refunds: [
        {
          id: "refund-1",
          paymentId: "payment-1",
          method: "CASH",
          provider: "NONE",
          amount: 1000,
          state: "APPROVED",
          occurredAt: new Date("2026-10-07T10:05:00.000Z"),
        },
      ],
      cashMovements: [
        {
          id: "movement-1",
          type: "SALE",
          amount: 1000,
          actorId: "cashier-1",
          occurredAt: new Date("2026-10-07T10:01:00.000Z"),
        },
        {
          id: "movement-2",
          type: "REFUND",
          amount: 1000,
          actorId: "cashier-1",
          occurredAt: new Date("2026-10-07T10:05:00.000Z"),
        },
      ],
      ...overrides,
    },
  };
}

export const A_SESSION_OPENED_FACT: SyncedFact = {
  kind: "cash_session_opened",
  session: {
    id: "session-1",
    openedBy: "cashier-1",
    openedAt: new Date("2026-10-07T09:00:00.000Z"),
    openingFloat: 5000,
  },
};

export const A_SESSION_CLOSED_FACT: SyncedFact = {
  kind: "cash_session_closed",
  session: {
    id: "session-1",
    closedBy: "cashier-1",
    closedAt: new Date("2026-10-07T20:00:00.000Z"),
    expectedCash: 6500,
    countedCash: 6400,
    difference: -100,
  },
};

export const A_CASH_MOVEMENT_FACT: SyncedFact = {
  kind: "cash_movement_recorded",
  movement: {
    sessionId: "session-1",
    type: "CASH_OUT",
    amount: 300,
    reason: "Bolsas",
    refType: null,
    refId: null,
    actorId: "cashier-1",
    authorizedBy: "supervisor-1",
    occurredAt: new Date("2026-10-07T12:00:00.000Z"),
  },
};

export const A_GATE_FAILED_FACT: SyncedFact = {
  kind: "fiscal_gate_failed",
  gateFailure: {
    saleId: "sale-1",
    reason: "issuer_identification_missing",
    evaluatedAt: new Date("2026-10-07T10:00:01.000Z"),
  },
};
