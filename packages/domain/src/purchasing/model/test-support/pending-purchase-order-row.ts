import type { PendingPurchaseOrderRow } from "../pending-purchase-orders-report.js";

export function aPendingOrderRow(
  overrides: Partial<PendingPurchaseOrderRow> = {},
): PendingPurchaseOrderRow {
  return {
    orderId: "order-1",
    supplierId: "supplier-1",
    supplierName: "Distribuidora Norte",
    state: "SENT",
    sentAt: new Date("2026-10-01T15:00:00.000Z"),
    lines: [{ packages: 2, expectedPackagePriceCents: 1_500 }],
    ...overrides,
  };
}
