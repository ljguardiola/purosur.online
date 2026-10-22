import type { FiscalTaskKind } from "./fiscal-task.js";

export const DEFERRED_SALE_STATES = ["pending", "satisfied", "cancelled", "expired"] as const;
export type DeferredSaleState = (typeof DEFERRED_SALE_STATES)[number];

export const PENDING_DEFERRED_SALE_STATE = "pending" satisfies DeferredSaleState;
export const EXPIRED_DEFERRED_SALE_STATE = "expired" satisfies DeferredSaleState;

const DEFERRED_SALE_EXPIRED_TASK_KIND = "deferred_sale_expired";

export const FISCAL_TASK_KINDS = [
  "external_invoicing",
  "credit_note_rejected",
  DEFERRED_SALE_EXPIRED_TASK_KIND,
] as const satisfies readonly (FiscalTaskKind | typeof DEFERRED_SALE_EXPIRED_TASK_KIND)[];

export function isUnbilledDeferredSale({
  state,
  regularizationTaskOpen,
}: {
  state: DeferredSaleState;
  regularizationTaskOpen: boolean;
}): boolean {
  return (
    state === PENDING_DEFERRED_SALE_STATE ||
    (state === EXPIRED_DEFERRED_SALE_STATE && regularizationTaskOpen)
  );
}

export type DeferredSaleSettling = "satisfied" | "cancelled";

export function deferredSaleSettlement(
  state: DeferredSaleState,
  settling: DeferredSaleSettling,
): { state: DeferredSaleState; closesRegularizationTask: boolean } {
  if (state === PENDING_DEFERRED_SALE_STATE) {
    return { state: settling, closesRegularizationTask: false };
  }
  if (state === EXPIRED_DEFERRED_SALE_STATE) {
    return { state: settling, closesRegularizationTask: true };
  }
  return { state, closesRegularizationTask: false };
}

export interface ExpiredDeferredSale {
  id: string;
  registerId: string;
  occurredAt: Date;
  total: number;
  shortCode: string;
}

export interface DeferredSaleRegularizationTask {
  kind: typeof DEFERRED_SALE_EXPIRED_TASK_KIND;
  state: "open";
  deferredSaleId: string;
  registerId: string;
  saleOccurredAt: Date;
  total: number;
  shortCode: string;
  createdAt: Date;
}

export function deferredSaleRegularizationTask(
  sale: ExpiredDeferredSale,
  createdAt: Date,
): DeferredSaleRegularizationTask {
  return {
    kind: DEFERRED_SALE_EXPIRED_TASK_KIND,
    state: "open",
    deferredSaleId: sale.id,
    registerId: sale.registerId,
    saleOccurredAt: sale.occurredAt,
    total: sale.total,
    shortCode: sale.shortCode,
    createdAt,
  };
}
