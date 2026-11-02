import type { PurchaseOrderDocumentSource } from "../purchase-order-document.js";

export function documentSource(
  overrides: Partial<PurchaseOrderDocumentSource> = {},
): PurchaseOrderDocumentSource {
  return {
    supplier: { name: "Distribuidora Sur" },
    createdAt: new Date("2026-03-10T15:00:00.000Z"),
    lines: [
      {
        product: {
          name: "Yerba",
          brandName: "Piragüé",
          netContent: { quantity: 500, unit: "G" },
          saleUnit: "UNIT",
        },
        packages: 3,
        quantityPerPackage: 12_000,
        supplierItem: { code: "YER-500", description: "Yerba mate 500 g x12" },
      },
      {
        product: { name: "Harina", brandName: null, netContent: null, saleUnit: "KG" },
        packages: 1,
        quantityPerPackage: 25_000,
        supplierItem: null,
      },
    ],
    ...overrides,
  };
}
