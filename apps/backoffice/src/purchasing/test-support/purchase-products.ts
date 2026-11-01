import type { PurchaseChoices } from "@purosur/contracts";

export const aceiteDeAlmendras: PurchaseChoices["products"][number] = {
  id: "90d00000-0000-4000-8000-000000000004",
  name: "Aceite de Almendras",
  brandName: "Vitora",
  netContent: { quantity: 30, unit: "ML" },
  saleUnit: "UNIT",
};

export const MIEL_PRODUCT_ID = "90d00000-0000-4000-8000-000000000001";
export const AVENA_PRODUCT_ID = "90d00000-0000-4000-8000-000000000002";

export const purchasableProducts: PurchaseChoices["products"] = [
  {
    id: MIEL_PRODUCT_ID,
    name: "Miel pura de abeja 1 kg",
    brandName: null,
    netContent: null,
    saleUnit: "UNIT",
  },
  {
    id: AVENA_PRODUCT_ID,
    name: "Avena arrollada",
    brandName: null,
    netContent: null,
    saleUnit: "KG",
  },
  {
    id: "90d00000-0000-4000-8000-000000000003",
    name: "Almendras peladas",
    brandName: null,
    netContent: null,
    saleUnit: "KG",
  },
];
