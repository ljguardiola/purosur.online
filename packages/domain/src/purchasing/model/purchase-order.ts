export const PURCHASE_ORDER_STATES = ["DRAFT", "CANCELLED"] as const;

export type PurchaseOrderState = (typeof PURCHASE_ORDER_STATES)[number];

export function mayBeEdited(state: PurchaseOrderState): boolean {
  return state === "DRAFT";
}

export function mayBeCancelled(state: PurchaseOrderState): boolean {
  return state === "DRAFT";
}

export interface PricedOrderLine {
  packages: number;
  expectedPackagePriceCents: number | null;
}

export function expectedOrderTotal(lines: readonly PricedOrderLine[]): {
  expectedTotalCents: number;
  hasUnpricedLine: boolean;
} {
  let expectedTotalCents = 0;
  let hasUnpricedLine = false;
  for (const line of lines) {
    if (line.expectedPackagePriceCents === null) {
      hasUnpricedLine = true;
    } else {
      expectedTotalCents += line.packages * line.expectedPackagePriceCents;
    }
  }
  return { expectedTotalCents, hasUnpricedLine };
}
