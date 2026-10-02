import type { CatalogProduct } from "../catalog-store.js";

export function catalogProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "product-1",
    name: "Miel pura de abeja 1 kg",
    categoryId: "category-1",
    categoryName: "Almacén",
    brandId: null,
    saleUnit: "UNIT",
    barcodes: [],
    tagIds: [],
    netContent: null,
    active: true,
    version: 1,
    ...overrides,
  };
}
