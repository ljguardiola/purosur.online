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
    creditNote: null,
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

export const A_DEFERRED_SALE_RECORDED_FACT: SyncedFact = {
  kind: "deferred_sale_recorded",
  deferredSale: {
    id: "deferred-1",
    saleId: "sale-1",
    occurredAt: new Date("2026-10-07T10:00:00.000Z"),
    total: 4800,
    reason: "pre_emission_gate_failed",
    shortCode: "7KQ4M2P9",
    routedAt: new Date("2026-10-07T10:00:01.000Z"),
  },
  unclearDocument: null,
};

export const A_CLOCK_CORRECTED_FACT: SyncedFact = {
  kind: "clock_corrected",
  correction: {
    registerId: "register-1",
    pointOfSale: 12,
    documentType: "factura_c",
    previousReading: new Date("2026-10-07T12:00:00.000Z"),
    previousReadingSource: "clock_mark",
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

type DeferredSaleSatisfied = Extract<SyncedFact, { kind: "deferred_sale_satisfied" }>;

type InvoiceIssuer = Omit<DeferredSaleSatisfied["satisfaction"]["document"]["issuer"], "version">;

export function aDeferredSaleSatisfiedFact(issuer: InvoiceIssuer): DeferredSaleSatisfied {
  return {
    kind: "deferred_sale_satisfied",
    satisfaction: {
      id: "deferred-1",
      saleId: "sale-1",
      fiscalDocumentId: "document-1",
      pointOfSale: 7,
      number: 42,
      issuedOn: "2026-10-07",
      document: {
        invoiceClass: "C",
        total: 12_500,
        netAmount: 12_500,
        vatAmount: 0,
        issuer: { ...issuer, version: 3 },
        buyerTaxStatusCode: 5,
        buyerTaxStatusDescription: "Consumidor Final",
      },
      authorizationCode: "75123456789012",
      authorizationCodeDueOn: "2026-10-17",
      reservedAt: new Date("2026-10-09T09:59:58.000Z"),
      satisfiedAt: new Date("2026-10-09T10:00:00.000Z"),
    },
  };
}

type SaleReturned = Extract<SyncedFact, { kind: "sale_returned" }>;

export function aReturnedSaleFact(
  overrides: Partial<SaleReturned["saleReturn"]> = {},
): SaleReturned {
  const occurredAt = new Date("2026-10-08T10:00:00.000Z");
  return {
    kind: "sale_returned",
    saleReturn: {
      id: "return-1",
      saleId: "sale-1",
      sessionId: "session-2",
      actorId: "cashier-1",
      authorizedBy: null,
      ticketSource: "QR",
      occurredAt,
      lines: [
        {
          saleLineId: "line-1",
          productId: "product-1",
          quantity: 1,
          reason: "change_of_mind",
          disposition: "restock",
          refundedAmount: 1000,
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
          occurredAt,
        },
      ],
      cashMovements: [
        { id: "movement-1", type: "REFUND", amount: 1000, actorId: "cashier-1", occurredAt },
      ],
      stockMovements: [
        {
          id: "movement-2",
          saleLineId: "line-1",
          productId: "product-1",
          kind: "return",
          reason: null,
          delta: 1000,
        },
      ],
      ...overrides,
    },
  };
}
