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
      operationNumber: null,
      total: 1500,
      saleDiscount: null,
      saleDiscountAmount: 0,
      lines: [
        {
          id: "line-1",
          productId: "product-1",
          productName: "Yerba mate 1 kg",
          weightSource: null,
          manualAdjustment: null,
          quantity: 1,
          listUnitPrice: 1500,
          priceListId: "price-list-1",
          promotionId: null,
          discountAmount: 0,
          saleDiscountShare: 0,
          promotions: [],
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
      stockMovements: null,
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
      saleDiscount: null,
      saleDiscountAmount: 0,
      lines: [
        {
          id: "line-1",
          productId: "product-1",
          productName: "Yerba mate 1 kg",
          weightSource: null,
          manualAdjustment: null,
          quantity: 2,
          listUnitPrice: 1500,
          priceListId: "price-list-1",
          promotionId: null,
          discountAmount: 0,
          saleDiscountShare: 0,
          promotions: [],
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

type SaleVoided = Extract<SyncedFact, { kind: "sale_voided" }>;

export function aVoidedSaleFact(overrides: Partial<SaleVoided["sale"]> = {}): SaleVoided {
  const { cancelledAt, ...cancelled } = aCancelledSaleFact().sale;
  return {
    kind: "sale_voided",
    sale: {
      ...cancelled,
      voidedAt: cancelledAt,
      stockMovements: [
        { id: "movement-3", saleLineId: "line-1", productId: "product-1", delta: 2000 },
      ],
      deferredRecordCancelled: false,
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

export const A_CLOCK_CORRECTED_FACT: SyncedFact = {
  kind: "clock_corrected",
  correction: {
    registerId: "register-1",
    pointOfSale: 12,
    documentType: "factura_c",
    previousReading: new Date("2026-10-07T12:00:00.000Z"),
    correctedReading: new Date("2026-10-05T12:00:00.000Z"),
    actorId: "cashier-1",
  },
};

export const AN_OPENING_COUNT_RECORDED_FACT: SyncedFact = {
  kind: "opening_count_recorded",
  count: {
    movementId: "movement-1",
    productId: "product-1",
    counted: 6_000,
    expiresOn: "2027-01-31",
    countedAt: new Date("2026-10-07T09:00:00.000Z"),
    actorId: "cashier-1",
  },
};

export const AN_OPENING_COUNT_WITHDRAWN_FACT: SyncedFact = {
  kind: "opening_count_withdrawn",
  withdrawal: {
    movementId: "movement-2",
    withdrawnMovementId: "movement-1",
    withdrawnAt: new Date("2026-10-07T09:10:00.000Z"),
    actorId: "cashier-1",
  },
};
