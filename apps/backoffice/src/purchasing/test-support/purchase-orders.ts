import type { PurchaseOrderDetail, PurchaseOrderSummary } from "@purosur/contracts";
import { AVENA_PRODUCT_ID, MIEL_PRODUCT_ID } from "./purchase-products";

export const ORDER_ID = "90e00000-0000-4000-8000-000000000001";
export const CANCELLED_ORDER_ID = "90e00000-0000-4000-8000-000000000002";
export const SUPPLIER_ID = "90e00000-0000-4000-8000-0000000000a1";
export const OTHER_SUPPLIER_ID = "90e00000-0000-4000-8000-0000000000a2";

export const DRAFT_SUMMARY: PurchaseOrderSummary = {
  id: ORDER_ID,
  supplier: { id: SUPPLIER_ID, name: "Distribuidora Andina" },
  state: "DRAFT",
  createdAt: "2026-03-10T15:00:00.000Z",
  lineCount: 2,
  expectedTotalCents: 555_000,
  hasUnpricedLine: true,
};

export const PRICED_SUMMARY: PurchaseOrderSummary = {
  id: "90e00000-0000-4000-8000-000000000003",
  supplier: { id: OTHER_SUPPLIER_ID, name: "Granos del Sur" },
  state: "DRAFT",
  createdAt: "2026-03-11T15:00:00.000Z",
  lineCount: 1,
  expectedTotalCents: 120_000,
  hasUnpricedLine: false,
};

export const CANCELLED_SUMMARY: PurchaseOrderSummary = {
  id: CANCELLED_ORDER_ID,
  supplier: { id: OTHER_SUPPLIER_ID, name: "Granos del Sur" },
  state: "CANCELLED",
  createdAt: "2026-03-09T15:00:00.000Z",
  lineCount: 1,
  expectedTotalCents: 90_000,
  hasUnpricedLine: false,
};

export const DRAFT_ORDER: PurchaseOrderDetail = {
  id: ORDER_ID,
  supplier: { id: SUPPLIER_ID, name: "Distribuidora Andina" },
  state: "DRAFT",
  createdAt: "2026-03-10T15:00:00.000Z",
  lines: [
    {
      product: {
        id: MIEL_PRODUCT_ID,
        name: "Miel pura de abeja 1 kg",
        brandName: null,
        netContent: null,
        saleUnit: "UNIT",
      },
      packages: 3,
      quantityPerPackage: 12_000,
      expectedPackagePriceCents: 185_000,
      expectedTotalCents: 555_000,
    },
    {
      product: {
        id: AVENA_PRODUCT_ID,
        name: "Avena arrollada",
        brandName: null,
        netContent: null,
        saleUnit: "KG",
      },
      packages: 2,
      quantityPerPackage: 25_000,
      expectedPackagePriceCents: null,
      expectedTotalCents: null,
    },
  ],
  expectedTotalCents: 555_000,
  hasUnpricedLine: true,
  editable: true,
  cancellable: true,
};

export const CANCELLED_ORDER: PurchaseOrderDetail = {
  ...DRAFT_ORDER,
  id: CANCELLED_ORDER_ID,
  state: "CANCELLED",
  editable: false,
  cancellable: false,
};
