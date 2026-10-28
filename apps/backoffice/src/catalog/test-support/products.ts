import type { BrandSummary, CategorySummary, ListedProduct } from "@purosur/contracts";

export const groceries: CategorySummary = {
  id: "ca7e0000-0000-4000-8000-000000000001",
  name: "Almacén",
  version: 1,
  parentId: null,
};
export const driedFruits: CategorySummary = {
  id: "ca7e0000-0000-4000-8000-000000000002",
  name: "Frutos secos",
  version: 1,
  parentId: null,
};

export const honey: ListedProduct = {
  id: "90d00000-0000-4000-8000-000000000001",
  name: "Miel pura de abeja 1 kg",
  categoryId: "ca7e0000-0000-4000-8000-000000000001",
  brandId: null,
  categoryName: "Almacén",
  saleUnit: "UNIT",
  barcodes: ["7790987000015"],
  tagIds: [],
  netContent: null,
  active: true,
  labelCode: null,
  labelModules: null,
  version: 1,
  currentUnitPrice: null,
};

export const almonds: ListedProduct = {
  id: "90d00000-0000-4000-8000-000000000002",
  name: "Almendras peladas",
  categoryId: "ca7e0000-0000-4000-8000-000000000002",
  brandId: null,
  categoryName: "Frutos secos",
  saleUnit: "KG",
  barcodes: ["7790000000001"],
  tagIds: [],
  netContent: null,
  active: true,
  labelCode: null,
  labelModules: null,
  version: 1,
  currentUnitPrice: null,
};

export const retiredHoney: ListedProduct = {
  ...honey,
  id: "90d00000-0000-4000-8000-000000000003",
  name: "Miel de caña 500 g",
  barcodes: ["7790987000022"],
  active: false,
};

export const vitora: BrandSummary = {
  id: "b2a40000-0000-4000-8000-000000000001",
  name: "Vitora",
  active: true,
  version: 1,
  productCount: 2,
};

export const cabriola: BrandSummary = {
  id: "b2a40000-0000-4000-8000-000000000002",
  name: "Cabriola",
  active: false,
  version: 1,
  productCount: 1,
};

export const almondOil: ListedProduct = {
  ...honey,
  id: "90d00000-0000-4000-8000-000000000004",
  name: "Aceite de Almendras",
  brandId: vitora.id,
  barcodes: ["7790001234567"],
  netContent: { quantity: 30, unit: "ML" },
  currentUnitPrice: 450000,
};

export const lavenderOil: ListedProduct = {
  ...honey,
  id: "90d00000-0000-4000-8000-000000000005",
  name: "Aceite de Lavanda",
  brandId: vitora.id,
  barcodes: ["7790001234574", "7790001234581"],
};

export const creamCheese: ListedProduct = {
  ...honey,
  id: "90d00000-0000-4000-8000-000000000006",
  name: "Queso crema",
  brandId: cabriola.id,
  barcodes: ["7790001234598"],
};

export const pricedAlmonds: ListedProduct = { ...almonds, currentUnitPrice: 120000 };
