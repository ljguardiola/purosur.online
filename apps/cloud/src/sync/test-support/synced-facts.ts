import { randomUUID } from "node:crypto";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";

type FactOf<TKind extends SyncedFact["kind"]> = Extract<SyncedFact, { kind: TKind }>;

export type CompletedSale = FactOf<"sale_completed">["sale"];

const USER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const COMPLETED_AT = new Date("2026-10-06T11:20:00.000Z");

export function aCompletedSale(overrides: Partial<CompletedSale> = {}): CompletedSale {
  const id = overrides.id ?? randomUUID();
  return {
    id,
    sessionId: randomUUID(),
    actorId: USER,
    completedAt: COMPLETED_AT,
    total: 4800,
    lines: [
      {
        id: randomUUID(),
        productId: randomUUID(),
        productName: "Azucar",
        quantity: 2,
        listUnitPrice: 2400,
        priceListId: randomUUID(),
        promotionId: null,
        discountAmount: 0,
        lineTotal: 4800,
      },
    ],
    payments: [
      {
        id: randomUUID(),
        method: "CASH",
        provider: "NONE",
        amount: 5000,
        tendered: 5000,
        state: "APPROVED",
        occurredAt: COMPLETED_AT,
        authorizedBy: null,
        confirmedAt: null,
      },
    ],
    cashMovements: [
      { id: randomUUID(), type: "SALE", amount: 4800, actorId: USER, occurredAt: COMPLETED_AT },
      { id: randomUUID(), type: "CHANGE", amount: 200, actorId: USER, occurredAt: COMPLETED_AT },
    ],
    ...overrides,
  };
}

export type CancelledSale = FactOf<"sale_cancelled">["sale"];

const CANCELLED_AT = new Date("2026-10-06T11:25:00.000Z");

export function aCancelledSale(overrides: Partial<CancelledSale> = {}): CancelledSale {
  const cancelledAt = overrides.cancelledAt ?? CANCELLED_AT;
  const payment = {
    id: randomUUID(),
    method: "CASH" as const,
    provider: "NONE" as const,
    amount: 1000,
    tendered: 1000,
    state: "APPROVED" as const,
    occurredAt: COMPLETED_AT,
    authorizedBy: null,
    confirmedAt: null,
  };
  return {
    id: randomUUID(),
    sessionId: randomUUID(),
    actorId: USER,
    authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
    cancelledAt,
    total: 4800,
    lines: aCompletedSale().lines,
    payments: [payment],
    refunds: [
      {
        id: randomUUID(),
        paymentId: payment.id,
        method: "CASH",
        provider: "NONE",
        amount: 1000,
        state: "APPROVED",
        occurredAt: cancelledAt,
      },
    ],
    cashMovements: [
      { id: randomUUID(), type: "SALE", amount: 1000, actorId: USER, occurredAt: COMPLETED_AT },
      { id: randomUUID(), type: "REFUND", amount: 1000, actorId: USER, occurredAt: cancelledAt },
    ],
    ...overrides,
  };
}

export function aTransferCancelledSale(overrides: Partial<CancelledSale> = {}): CancelledSale {
  const base = aCancelledSale();
  const [cash] = base.payments;
  const [cashRefund] = base.refunds;
  if (!cash || !cashRefund) {
    throw new Error("test setup: the cancelled sale has no payment");
  }
  const payment = {
    ...cash,
    method: "TRANSFER" as const,
    amount: 2000,
    tendered: null,
    authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
    confirmedAt: COMPLETED_AT,
  };
  return {
    ...base,
    payments: [payment],
    refunds: [
      {
        ...cashRefund,
        paymentId: payment.id,
        method: "TRANSFER",
        amount: 2000,
        state: "PENDING",
      },
    ],
    cashMovements: [],
    ...overrides,
  };
}

export function aCashSessionOpenedFact(
  overrides: Partial<FactOf<"cash_session_opened">["session"]> = {},
): SyncedFact {
  return {
    kind: "cash_session_opened",
    session: {
      id: randomUUID(),
      openedBy: USER,
      openedAt: new Date("2026-10-06T11:00:00.000Z"),
      openingFloat: 10000,
      ...overrides,
    },
  };
}

export function aCashSessionClosedFact(
  overrides: Partial<FactOf<"cash_session_closed">["session"]> = {},
): SyncedFact {
  return {
    kind: "cash_session_closed",
    session: {
      id: randomUUID(),
      closedBy: USER,
      closedAt: new Date("2026-10-06T11:44:00.000Z"),
      expectedCash: 9900,
      countedCash: 9800,
      difference: -100,
      ...overrides,
    },
  };
}

export function aCashMovementRecordedFact(
  overrides: Partial<FactOf<"cash_movement_recorded">["movement"]> = {},
): SyncedFact {
  return {
    kind: "cash_movement_recorded",
    movement: {
      sessionId: randomUUID(),
      type: "WITHDRAWAL",
      amount: 1000,
      reason: "Retiro parcial",
      refType: null,
      refId: null,
      actorId: USER,
      authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
      occurredAt: new Date("2026-10-06T11:08:00.000Z"),
      ...overrides,
    },
  };
}
