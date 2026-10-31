import type {
  BrandSummary,
  CategorySummary,
  SupplierPriceListRowProductCreated,
  SupplierPriceListRowProductCreationBody,
  TagList,
} from "@purosur/contracts";

const GROCERIES: CategorySummary = {
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

export const CREATION_BRAND: BrandSummary = {
  id: "b2a00000-0000-4000-8000-000000000001",
  name: "Dulcor",
  active: true,
  version: 1,
  productCount: 4,
};

export const CREATION_BRANDS: BrandSummary[] = [CREATION_BRAND];

export const CREATION_TAG_LIST: TagList = {
  tags: [
    {
      id: "7a600000-0000-4000-8000-0000000000a1",
      name: "Sin TACC",
      active: true,
      version: 1,
      productCount: 12,
    },
  ],
  taggedProductCount: 12,
};

export const PRODUCT_CREATED: SupplierPriceListRowProductCreated = {
  productId: "90d00000-0000-4000-8000-000000000061",
};

export const CREATION_BODY: SupplierPriceListRowProductCreationBody = {
  version: 3,
  name: "Aceite de almendras",
  saleUnit: "UNIT",
  categoryId: DRIED_FRUITS.id,
  brandId: null,
  barcodes: ["7790001000029"],
  tagIds: [],
  netContent: null,
  quantity: 10_000,
  vatRate: null,
};
