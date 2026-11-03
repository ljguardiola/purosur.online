import type { PurchaseChoices, PurchaseSummary, SupplierSummary } from "@purosur/contracts";
import { purchasableProducts } from "./purchase-products";

export const compraDeMiel: PurchaseSummary = {
  id: "c0a00000-0000-4000-8000-000000000001",
  purchasedOn: "2026-09-14",
  supplier: { id: "5a900000-0000-4000-8000-000000000001", name: "Distribuidora Andina" },
  receiptType: "factura_b",
  receiptNumber: "0001-00001234",
  note: null,
  recordedAt: "2026-09-14T18:30:00.000Z",
  lines: [
    {
      id: "c0b00000-0000-4000-8000-000000000001",
      product: {
        id: "90d00000-0000-4000-8000-000000000001",
        name: "Miel pura de abeja 1 kg",
        brandName: null,
        netContent: null,
        saleUnit: "UNIT",
      },
      packages: 2,
      quantity: 24_000,
      costPaidCents: 7_200_00,
      quantityPerPackage: 12_000,
      unitCostCents: 600_00,
      lotName: "Compra 03/11/2026",
      expiresOn: "2027-01-31",
    },
  ],
};

export const compraDeAvena: PurchaseSummary = {
  id: "c0a00000-0000-4000-8000-000000000002",
  purchasedOn: "2026-09-10",
  supplier: { id: "5a900000-0000-4000-8000-000000000002", name: "Granos del Valle" },
  receiptType: "sin_comprobante",
  receiptNumber: null,
  note: "Entrega de la tarde",
  recordedAt: "2026-09-10T15:00:00.000Z",
  lines: [
    {
      id: "c0b00000-0000-4000-8000-000000000002",
      product: {
        id: "90d00000-0000-4000-8000-000000000002",
        name: "Avena arrollada",
        brandName: null,
        netContent: null,
        saleUnit: "KG",
      },
      packages: null,
      quantity: 12_500,
      costPaidCents: 2_000_00,
      quantityPerPackage: 1_000,
      unitCostCents: 2_000_00,
      lotName: "Técnico 07/10/2026",
      expiresOn: null,
    },
  ],
};

export function purchaseChoicesFrom(suppliers: SupplierSummary[]): PurchaseChoices {
  return {
    suppliers,
    products: purchasableProducts,
    today: "2026-09-16",
  };
}

export const compraDeAceite: PurchaseSummary = {
  ...compraDeAvena,
  id: "c0a00000-0000-4000-8000-000000000003",
  lines: [
    {
      ...(compraDeAvena.lines[0] as PurchaseSummary["lines"][number]),
      id: "c0b00000-0000-4000-8000-000000000003",
      product: {
        id: "90d00000-0000-4000-8000-000000000004",
        name: "Aceite de Almendras",
        brandName: "Vitora",
        netContent: { quantity: 30, unit: "ML" },
        saleUnit: "UNIT",
      },
    },
  ],
};
