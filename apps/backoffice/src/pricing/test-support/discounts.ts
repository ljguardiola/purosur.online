import type {
  CategorySummary,
  DiscountList,
  DiscountSummary,
  ProductSummary,
  TagSummary,
} from "@purosur/contracts";

export const yerbaOff: DiscountSummary = {
  id: "0b1f3c1e-4f6a-4d0e-9d6e-000000000001",
  name: "Yerba de septiembre",
  benefit: { kind: "PERCENT_OFF", percent: 15 },
  target: {
    kind: "PRODUCT",
    id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000101",
    name: "Yerba Playadito 1 kg",
  },
  validFrom: "2026-09-12",
  validTo: "2026-09-30",
  weekdays: [],
  active: true,
  version: 1,
};

export const almacenTuesdays: DiscountSummary = {
  id: "0b1f3c1e-4f6a-4d0e-9d6e-000000000002",
  name: "Martes de almacén",
  benefit: { kind: "PERCENT_OFF", percent: 10 },
  target: {
    kind: "CATEGORY",
    id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000201",
    name: "Almacén",
  },
  validFrom: "2026-10-01",
  validTo: "2026-10-31",
  weekdays: [2],
  active: true,
  version: 3,
};

export const sinTaccWinter: DiscountSummary = {
  id: "0b1f3c1e-4f6a-4d0e-9d6e-000000000003",
  name: "Sin TACC de invierno",
  benefit: { kind: "PERCENT_OFF", percent: 20 },
  target: {
    kind: "TAG",
    id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000301",
    name: "Sin TACC",
  },
  validFrom: "2026-12-01",
  validTo: "2027-02-28",
  weekdays: [1, 3, 5],
  active: true,
  version: 2,
};

export const endedPromotion: DiscountSummary = {
  id: "0b1f3c1e-4f6a-4d0e-9d6e-000000000004",
  name: "Vuelta a clases",
  benefit: { kind: "PERCENT_OFF", percent: 5 },
  target: {
    kind: "PRODUCT",
    id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000102",
    name: "Cuaderno rayado",
  },
  validFrom: "2026-03-01",
  validTo: "2026-03-31",
  weekdays: [],
  active: true,
  version: 1,
};

export const switchedOffPromotion: DiscountSummary = {
  id: "0b1f3c1e-4f6a-4d0e-9d6e-000000000005",
  name: "Aceite apagado",
  benefit: { kind: "PERCENT_OFF", percent: 30 },
  target: {
    kind: "PRODUCT",
    id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000103",
    name: "Aceite de girasol 900 ml",
  },
  validFrom: "2026-09-01",
  validTo: "2026-10-15",
  weekdays: [],
  active: false,
  version: 4,
};

export function discountList(discounts: DiscountSummary[]): DiscountList {
  return { discounts };
}

export const yerbaProduct: ProductSummary = {
  id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000101",
  name: "Yerba Playadito 1 kg",
  categoryId: "7a1f3c1e-4f6a-4d0e-9d6e-000000000202",
  categoryName: "Yerbas",
  brandId: null,
  saleUnit: "UNIT",
  barcodes: ["7790000000101"],
  tagIds: [],
  netContent: null,
  active: true,
  version: 1,
};

export const almondsProduct: ProductSummary = {
  ...yerbaProduct,
  id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000104",
  name: "Almendras peladas",
  saleUnit: "KG",
  barcodes: ["7790000000104"],
};

export const retiredProduct: ProductSummary = {
  ...yerbaProduct,
  id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000105",
  name: "Café en grano",
  barcodes: ["7790000000105"],
  active: false,
};

export const almacenCategory: CategorySummary = {
  id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000201",
  name: "Almacén",
  version: 1,
  parentId: null,
};

export const yerbasCategory: CategorySummary = {
  id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000202",
  name: "Yerbas",
  version: 1,
  parentId: "7a1f3c1e-4f6a-4d0e-9d6e-000000000201",
};

export const sinTaccTag: TagSummary = {
  id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000301",
  name: "Sin TACC",
  active: true,
  version: 1,
  productCount: 3,
};

export const veganoTag: TagSummary = {
  id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000302",
  name: "Vegano",
  active: true,
  version: 1,
  productCount: 2,
};

export const retiredTag: TagSummary = {
  id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000303",
  name: "Sin colorantes",
  active: false,
  version: 2,
  productCount: 1,
};
