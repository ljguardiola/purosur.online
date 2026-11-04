import type { ReceiptLineRow } from "../receipt-differences-report.js";

export function aReceiptLineRow(overrides: Partial<ReceiptLineRow> = {}): ReceiptLineRow {
  return {
    receiptId: "receipt-1",
    orderId: "order-1",
    supplierId: "supplier-1",
    supplierName: "Distribuidora Norte",
    receivedOn: "2026-10-01",
    product: {
      id: "product-1",
      name: "Yerba mate",
      brandName: "Taragui",
      netContent: { quantity: 500_000, unit: "G" },
      saleUnit: "UNIT",
    },
    receivedQuantity: 10_000,
    missingQuantity: 0,
    priceDifferenceCents: null,
    ...overrides,
  };
}
