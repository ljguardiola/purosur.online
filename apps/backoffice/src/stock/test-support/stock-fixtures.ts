import type { StockBalance, StockCount, StockMovement, StockProduct } from "@purosur/contracts";

export const almonds: StockBalance = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Almendras peladas",
  categoryId: "category-nuts",
  categoryName: "Frutos secos",
  saleUnit: "KG",
  balance: 12_150,
};

export const honey: StockBalance = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Miel pura de abeja 1 kg",
  categoryId: "category-grocery",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  balance: 24_000,
};

export const crackers: StockBalance = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Galletas de arroz integrales",
  categoryId: "category-grocery",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  balance: -4000,
};

export const tea: StockBalance = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Té verde en hebras 100 g",
  categoryId: "category-grocery",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  balance: 0,
};

export const almondsCount: StockCount = {
  id: "count-1",
  productId: almonds.id,
  productName: almonds.name,
  categoryId: almonds.categoryId,
  categoryName: almonds.categoryName,
  saleUnit: "KG",
  occurredAt: "2026-09-15T21:32:00.000Z",
  expected: 12_400,
  counted: 12_150,
  delta: -250,
  superseded: false,
};

export const honeyCount: StockCount = {
  id: "count-2",
  productId: honey.id,
  productName: honey.name,
  categoryId: honey.categoryId,
  categoryName: honey.categoryName,
  saleUnit: "UNIT",
  occurredAt: "2026-09-12T12:10:00.000Z",
  expected: 24_000,
  counted: 24_000,
  delta: 0,
  superseded: false,
};

export const supersededCount: StockCount = {
  ...honeyCount,
  id: "count-3",
  occurredAt: "2026-09-10T12:00:00.000Z",
  expected: 20_000,
  counted: 18_000,
  delta: -2000,
  superseded: true,
};

export const honeyLoss: StockMovement = {
  id: "movement-1",
  productId: honey.id,
  productName: honey.name,
  categoryName: honey.categoryName,
  saleUnit: "UNIT",
  kind: "loss",
  reason: "broken_or_spilled",
  delta: -1000,
  occurredAt: "2026-09-16T15:50:00.000Z",
  superseded: false,
};

export const almondsAdjustment: StockMovement = {
  id: "movement-2",
  productId: almonds.id,
  productName: almonds.name,
  categoryName: almonds.categoryName,
  saleUnit: "KG",
  kind: "adjustment",
  reason: "batch_correction",
  delta: 1200,
  occurredAt: "2026-09-14T13:00:00.000Z",
  superseded: false,
};

export function withoutBalance({ balance: _balance, ...product }: StockBalance): StockProduct {
  return product;
}
