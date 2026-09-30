import type { DiscountList, DiscountSummary, DiscountTargets } from "@purosur/contracts";

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

export const yerbaThreeForTwo: DiscountSummary = {
  id: "0b1f3c1e-4f6a-4d0e-9d6e-000000000006",
  name: "Yerba 3x2",
  benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
  target: {
    kind: "PRODUCT",
    id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000101",
    name: "Yerba Playadito 1 kg",
  },
  validFrom: "2026-09-15",
  validTo: "2026-10-15",
  weekdays: [],
  active: true,
  version: 2,
};

export const almondsThreeForTwo: DiscountSummary = {
  id: "0b1f3c1e-4f6a-4d0e-9d6e-000000000007",
  name: "Almendras 3x2",
  benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
  target: {
    kind: "PRODUCT",
    id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000104",
    name: "Almendras peladas",
  },
  validFrom: "2026-09-15",
  validTo: "2026-10-15",
  weekdays: [],
  active: false,
  version: 3,
};

export function discountList(discounts: DiscountSummary[]): DiscountList {
  return { discounts };
}

type ProductTarget = DiscountTargets["products"][number];
type TagTarget = DiscountTargets["tags"][number];

export const yerbaProduct: ProductTarget = {
  id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000101",
  name: "Yerba Playadito 1 kg",
  saleUnit: "UNIT",
};

export const almondsProduct: ProductTarget = {
  id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000104",
  name: "Almendras peladas",
  saleUnit: "KG",
};

export const retiredProduct: ProductTarget = {
  id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000105",
  name: "Café en grano",
  saleUnit: "UNIT",
};

export const almacenCategory: DiscountTargets["categories"][number] = {
  id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000201",
  name: "Almacén",
  parentId: null,
};

export const yerbasCategory: DiscountTargets["categories"][number] = {
  id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000202",
  name: "Yerbas",
  parentId: "7a1f3c1e-4f6a-4d0e-9d6e-000000000201",
};

const sinTaccTag: TagTarget = {
  id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000301",
  name: "Sin TACC",
};

export const veganoTag: TagTarget = {
  id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000302",
  name: "Vegano",
};

export const retiredTag: TagTarget = {
  id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000303",
  name: "Sin colorantes",
};

export const discountTargets: DiscountTargets = {
  products: [yerbaProduct, almondsProduct],
  categories: [almacenCategory, yerbasCategory],
  tags: [sinTaccTag, veganoTag],
};
