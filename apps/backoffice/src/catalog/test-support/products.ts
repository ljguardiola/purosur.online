import type { CategorySummary, ProductSummary } from "@purosur/contracts";

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

export const honey: ProductSummary = {
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
};

export const almonds: ProductSummary = {
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
};
