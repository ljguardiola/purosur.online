import type { CategorySummary, ProductSummary } from "@purosur/contracts";

export const groceries: CategorySummary = {
  id: "category-1",
  name: "Almacén",
  version: 1,
  parentId: null,
};
export const driedFruits: CategorySummary = {
  id: "category-2",
  name: "Frutos secos",
  version: 1,
  parentId: null,
};

export const honey: ProductSummary = {
  id: "product-1",
  name: "Miel pura de abeja 1 kg",
  categoryId: "category-1",
  brandId: null,
  categoryName: "Almacén",
  saleUnit: "UNIT",
  barcodes: ["7790987000015"],
  tagIds: [],
  netContent: null,
  active: true,
  labelCode: null,
  version: 1,
};

export const almonds: ProductSummary = {
  id: "product-2",
  name: "Almendras peladas",
  categoryId: "category-2",
  brandId: null,
  categoryName: "Frutos secos",
  saleUnit: "KG",
  barcodes: ["7790000000001"],
  tagIds: [],
  netContent: null,
  active: true,
  labelCode: null,
  version: 1,
};
