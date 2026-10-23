import { DEFERRED_SALE_EXPIRED_TASK_KIND, OPEN_FISCAL_TASK_STATE } from "./fiscal-task.js";

export const DEFERRED_SALE_STATES = ["pending", "satisfied", "cancelled", "expired"] as const;
export type DeferredSaleState = (typeof DEFERRED_SALE_STATES)[number];

export const PENDING_DEFERRED_SALE_STATE = "pending" satisfies DeferredSaleState;
export const EXPIRED_DEFERRED_SALE_STATE = "expired" satisfies DeferredSaleState;

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

export interface PendingDeferredSale {
  id: string;
  saleId: string;
  registerId: string;
  locationId: string;
  occurredAt: Date;
  total: number;
  shortCode: string;
}

export interface DeferredSaleRegularizationTask {
  kind: typeof DEFERRED_SALE_EXPIRED_TASK_KIND;
  state: typeof OPEN_FISCAL_TASK_STATE;
  deferredSaleId: string;
  registerId: string;
  saleOccurredAt: Date;
  total: number;
  shortCode: string;
  createdAt: Date;
}

export function deferredSaleRegularizationTask(
  sale: PendingDeferredSale,
  createdAt: Date,
): DeferredSaleRegularizationTask {
  return {
    kind: DEFERRED_SALE_EXPIRED_TASK_KIND,
    state: OPEN_FISCAL_TASK_STATE,
    deferredSaleId: sale.id,
    registerId: sale.registerId,
    saleOccurredAt: sale.occurredAt,
    total: sale.total,
    shortCode: sale.shortCode,
    createdAt,
  };
}
