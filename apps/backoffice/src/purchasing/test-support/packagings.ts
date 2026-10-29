import type { PackagingList, PackagingSummary } from "@purosur/contracts";

export const cajaDeMiel: PackagingSummary = {
  id: "9ac00000-0000-4000-8000-000000000001",
  productId: "90d00000-0000-4000-8000-000000000001",
  productName: "Miel pura de abeja 1 kg",
  brandName: null,
  netContent: null,
  productSaleUnit: "UNIT",
  saleUnit: "UNIT",
  saleUnitChanged: false,
  name: "Caja x 12",
  quantityPerPackage: 12_000,
  active: true,
  version: 1,
};
export const bolsaDeAvena: PackagingSummary = {
  id: "9ac00000-0000-4000-8000-000000000002",
  productId: "90d00000-0000-4000-8000-000000000002",
  productName: "Avena arrollada",
  brandName: null,
  netContent: null,
  productSaleUnit: "KG",
  saleUnit: "KG",
  saleUnitChanged: false,
  name: "Bolsa de 25 kg",
  quantityPerPackage: 25_000,
  active: true,
  version: 2,
};
export const bolsaDeAlmendras: PackagingSummary = {
  id: "9ac00000-0000-4000-8000-000000000003",
  productId: "90d00000-0000-4000-8000-000000000003",
  productName: "Almendras peladas",
  brandName: null,
  netContent: null,
  productSaleUnit: "KG",
  saleUnit: "KG",
  saleUnitChanged: false,
  name: "Bolsa de 2,5 kg",
  quantityPerPackage: 2500,
  active: false,
  version: 4,
};

export const cajaDeAceite: PackagingSummary = {
  id: "9ac00000-0000-4000-8000-000000000004",
  productId: "90d00000-0000-4000-8000-000000000004",
  productName: "Aceite de Almendras",
  brandName: "Vitora",
  netContent: { quantity: 30, unit: "ML" },
  productSaleUnit: "UNIT",
  saleUnit: "UNIT",
  saleUnitChanged: false,
  name: "Caja x 24",
  quantityPerPackage: 24_000,
  active: true,
  version: 1,
};

export const aceiteDeAlmendras: PackagingList["products"][number] = {
  id: "90d00000-0000-4000-8000-000000000004",
  name: "Aceite de Almendras",
  brandName: "Vitora",
  netContent: { quantity: 30, unit: "ML" },
  saleUnit: "UNIT",
};

export const packagableProducts: PackagingList["products"] = [
  {
    id: "90d00000-0000-4000-8000-000000000001",
    name: "Miel pura de abeja 1 kg",
    brandName: null,
    netContent: null,
    saleUnit: "UNIT",
  },
  {
    id: "90d00000-0000-4000-8000-000000000002",
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

export function packagingList(
  packagings: PackagingSummary[],
  products: PackagingList["products"] = packagableProducts,
): PackagingList {
  return { packagings, products };
}
