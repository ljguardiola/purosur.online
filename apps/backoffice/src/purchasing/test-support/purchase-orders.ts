import type { PurchaseOrderDetail, PurchaseOrderSummary } from "@purosur/contracts";
import { AVENA_PRODUCT_ID, MIEL_PRODUCT_ID } from "./purchase-products";

export const ORDER_ID = "90e00000-0000-4000-8000-000000000001";
const CANCELLED_ORDER_ID = "90e00000-0000-4000-8000-000000000002";
export const SUPPLIER_ID = "90e00000-0000-4000-8000-0000000000a1";
const OTHER_SUPPLIER_ID = "90e00000-0000-4000-8000-0000000000a2";

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

export const SENT_SUMMARY: PurchaseOrderSummary = {
  ...DRAFT_SUMMARY,
  state: "SENT",
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
      supplierItem: { code: "MIEL-1K", description: "Miel pura x 12 frascos" },
      receivedQuantity: 0,
      outstandingQuantity: 36_000,
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
      supplierItem: null,
      receivedQuantity: 0,
      outstandingQuantity: 50_000,
    },
  ],
  expectedTotalCents: 555_000,
  hasUnpricedLine: true,
  editable: true,
  shareable: true,
  documentShareable: true,
  cancellable: true,
  receivable: false,
  receipts: [],
};

export const SENT_ORDER: PurchaseOrderDetail = {
  ...DRAFT_ORDER,
  state: "SENT",
  editable: false,
  shareable: false,
  cancellable: true,
  receivable: true,
};

export const CANCELLED_ORDER: PurchaseOrderDetail = {
  ...DRAFT_ORDER,
  id: CANCELLED_ORDER_ID,
  state: "CANCELLED",
  editable: false,
  shareable: false,
  documentShareable: false,
  cancellable: false,
};

export const RECEIPT_PURCHASE_ID = "90e00000-0000-4000-8000-0000000000c1";

export const PARTIALLY_RECEIVED_ORDER: PurchaseOrderDetail = {
  ...SENT_ORDER,
  state: "PARTIALLY_RECEIVED",
  lines: SENT_ORDER.lines.map((line) =>
    line.product.id === MIEL_PRODUCT_ID
      ? { ...line, receivedQuantity: 24_000, outstandingQuantity: 12_000 }
      : { ...line, receivedQuantity: 40_000, outstandingQuantity: 10_000 },
  ),
  receivable: true,
  receipts: [
    {
      id: "90e00000-0000-4000-8000-0000000000d1",
      receivedAt: "2026-03-12T15:00:00.000Z",
      purchaseId: RECEIPT_PURCHASE_ID,
      lines: [
        {
          productId: MIEL_PRODUCT_ID,
          receivedQuantity: 24_000,
          missingQuantity: 12_000,
          priceDifferenceCents: 5_000,
        },
        {
          productId: AVENA_PRODUCT_ID,
          receivedQuantity: 40_000,
          missingQuantity: 10_000,
          priceDifferenceCents: null,
        },
      ],
    },
  ],
};

export const RECEIVED_ORDER: PurchaseOrderDetail = {
  ...PARTIALLY_RECEIVED_ORDER,
  state: "RECEIVED",
  cancellable: false,
  receivable: false,
};
