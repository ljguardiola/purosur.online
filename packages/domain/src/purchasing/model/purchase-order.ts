export const PURCHASE_ORDER_STATES = [
  "DRAFT",
  "SENT",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
] as const;

export type PurchaseOrderState = (typeof PURCHASE_ORDER_STATES)[number];

export const RECEIVABLE_PURCHASE_ORDER_STATES = [
  "SENT",
  "PARTIALLY_RECEIVED",
] as const satisfies readonly PurchaseOrderState[];

export type ReceivablePurchaseOrderState = (typeof RECEIVABLE_PURCHASE_ORDER_STATES)[number];

export function mayBeEdited(state: PurchaseOrderState): boolean {
  return state === "DRAFT";
}

export function mayBeShared(state: PurchaseOrderState): boolean {
  return state === "DRAFT";
}

export function mayBeSharedAsDocument(state: PurchaseOrderState): boolean {
  return state === "DRAFT" || state === "SENT";
}

export function mayBeCancelled(state: PurchaseOrderState): boolean {
  return state === "DRAFT" || state === "SENT" || state === "PARTIALLY_RECEIVED";
}

export function mayBeReceived(state: PurchaseOrderState): boolean {
  return RECEIVABLE_PURCHASE_ORDER_STATES.some((receivable) => receivable === state);
}

export interface PricedOrderLine {
  packages: number;
  expectedPackagePriceCents: number | null;
}

export function expectedLineTotal(line: PricedOrderLine): number | null {
  return line.expectedPackagePriceCents === null
    ? null
    : line.packages * line.expectedPackagePriceCents;
}

export function expectedOrderTotal(lines: readonly PricedOrderLine[]): {
  expectedTotalCents: number;
  hasUnpricedLine: boolean;
} {
  let expectedTotalCents = 0;
  let hasUnpricedLine = false;
  for (const line of lines) {
    const lineTotal = expectedLineTotal(line);
    if (lineTotal === null) {
      hasUnpricedLine = true;
    } else {
      expectedTotalCents += lineTotal;
    }
  }
  return { expectedTotalCents, hasUnpricedLine };
}
