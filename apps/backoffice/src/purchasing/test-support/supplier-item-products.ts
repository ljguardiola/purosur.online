import type {
  CategorySummary,
  SupplierPriceListRowProductCreated,
  SupplierPriceListRowProductCreationBody,
} from "@purosur/contracts";

export const GROCERIES: CategorySummary = {
  id: "c1000000-0000-4000-8000-000000000001",
  name: "Almacén",
  version: 1,
  parentId: null,
};

export const DRIED_FRUITS: CategorySummary = {
  id: "c1000000-0000-4000-8000-000000000002",
  name: "Frutos secos",
  version: 1,
  parentId: GROCERIES.id,
};

export const CREATION_CATEGORIES: CategorySummary[] = [GROCERIES, DRIED_FRUITS];

export const PRODUCT_CREATED: SupplierPriceListRowProductCreated = {
  productId: "90d00000-0000-4000-8000-000000000061",
  packagingId: "9ac00000-0000-4000-8000-000000000061",
};

export const CREATION_BODY: SupplierPriceListRowProductCreationBody = {
  version: 3,
  saleUnit: "UNIT",
  categoryId: DRIED_FRUITS.id,
  barcodes: ["7790001000029"],
  packagingName: null,
  quantityPerPackage: 10_000,
  vatRate: null,
};
