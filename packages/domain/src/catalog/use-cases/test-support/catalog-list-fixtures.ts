import type { CatalogListProduct } from "../catalog-list-reader.js";

export function catalogProduct(overrides: Partial<CatalogListProduct> = {}): CatalogListProduct {
  return {
    id: "product-1",
    name: "Miel pura de abeja 1 kg",
    categoryId: "category-1",
    categoryName: "Almacén",
    brandId: null,
    brandName: null,
    saleUnit: "UNIT",
    barcodes: [],
    tagIds: [],
    netContent: null,
    active: true,
    version: 1,
    ...overrides,
  };
}
