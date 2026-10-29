import type { CurrentStockReportBody } from "@purosur/contracts";

type Product = CurrentStockReportBody["products"][number];

export const NUTS_CATEGORY_ID = "9a3f6c52-1d84-4b07-8c1e-5e7a2b9d4f10";
const PANTRY_CATEGORY_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";

export const almondsProduct: Product = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Almendras peladas",
  brand_name: null,
  net_content: null,
  category_id: NUTS_CATEGORY_ID,
  category_name: "Frutos secos",
  sale_unit: "KG",
  balance: 12_150,
  value_cents: 12_400_100,
  lots: [
    {
      id: "lot-1",
      lot_number: "L-2312",
      expires_on: "2026-10-14",
      technical: false,
      remaining: 4_300,
      unit_cost_cents: 1_018_000,
      value_cents: 4_377_400,
    },
    {
      id: "lot-2",
      lot_number: "L-2409",
      expires_on: "2027-02-28",
      technical: false,
      remaining: 7_850,
      unit_cost_cents: 1_022_000,
      value_cents: 8_022_700,
    },
  ],
};

export const yerbaProduct: Product = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Yerba mate 1 kg",
  brand_name: null,
  net_content: null,
  category_id: PANTRY_CATEGORY_ID,
  category_name: "Almacén",
  sale_unit: "UNIT",
  balance: 24_000,
  value_cents: 3_600_000,
  lots: [
    {
      id: "lot-3",
      lot_number: null,
      expires_on: null,
      technical: false,
      remaining: 24_000,
      unit_cost_cents: 150_000,
      value_cents: 3_600_000,
    },
  ],
};

export const crackersProduct: Product = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Galletas de arroz",
  brand_name: null,
  net_content: null,
  category_id: PANTRY_CATEGORY_ID,
  category_name: "Almacén",
  sale_unit: "UNIT",
  balance: -4_000,
  value_cents: -240_000,
  lots: [
    {
      id: "lot-4",
      lot_number: null,
      expires_on: null,
      technical: true,
      remaining: -4_000,
      unit_cost_cents: 60_000,
      value_cents: -240_000,
    },
  ],
};

export const teaProduct: Product = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Té verde en hebras",
  brand_name: null,
  net_content: null,
  category_id: PANTRY_CATEGORY_ID,
  category_name: "Almacén",
  sale_unit: "UNIT",
  balance: 6_000,
  value_cents: null,
  lots: [
    {
      id: "lot-5",
      lot_number: null,
      expires_on: "2027-01-31",
      technical: false,
      remaining: 6_000,
      unit_cost_cents: null,
      value_cents: null,
    },
  ],
};

export const almondOilProduct: Product = {
  id: "77777777-7777-4777-8777-777777777777",
  name: "Aceite de Almendras",
  brand_name: "Vitora",
  net_content: { quantity: 30, unit: "ML" },
  category_id: PANTRY_CATEGORY_ID,
  category_name: "Almacén",
  sale_unit: "UNIT",
  balance: 6_000,
  value_cents: 900_000,
  lots: [
    {
      id: "lot-8",
      lot_number: "L-4001",
      expires_on: "2027-05-01",
      technical: false,
      remaining: 6_000,
      unit_cost_cents: 150_000,
      value_cents: 900_000,
    },
  ],
};

export function currentStockReport(
  products: Product[] = [almondsProduct, yerbaProduct, crackersProduct, teaProduct],
): CurrentStockReportBody {
  const valued = products.map(({ value_cents }) => value_cents);
  return {
    products,
    categories: [
      { id: NUTS_CATEGORY_ID, name: "Frutos secos" },
      { id: PANTRY_CATEGORY_ID, name: "Almacén" },
    ],
    summary: {
      value_cents: valued.reduce<number>((sum, value) => sum + (value ?? 0), 0),
      product_count: products.length,
      negative_balance_count: products.filter(({ balance }) => balance < 0).length,
      without_cost_count: valued.filter((value) => value === null).length,
    },
  };
}
