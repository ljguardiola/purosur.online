import type { PurchasedLine } from "../purchases-by-supplier-report.js";

export function aLine(overrides: Partial<PurchasedLine> = {}): PurchasedLine {
  return {
    purchaseId: "purchase-1",
    supplierId: "supplier-1",
    supplierName: "Distribuidora Norte",
    purchasedOn: "2026-10-06",
    costPaidCents: 1_000,
    quantity: 1_000,
    quantityPerPackage: 1_000,
    ...overrides,
  };
}
