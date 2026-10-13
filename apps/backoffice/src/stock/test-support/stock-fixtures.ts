import type {
  InitialInventoryLotList,
  StockBalance,
  StockBalanceList,
  StockCount,
  StockMovement,
  StockMovementReasonList,
  StockProduct,
  StockProductBalance,
} from "@purosur/contracts";

type StockLot = StockBalance["lots"][number];

const almondsFirstLot: StockLot = {
  id: "lot-1",
  lotNumber: "L-2312",
  expiresOn: "2026-10-14",
  technical: false,
  remaining: 4_300,
  valueCents: 4_377_400,
  unitCostCents: 1_018_000,
  origin: { kind: "purchase", purchasedOn: "2026-08-05", supplierName: "Distribuidora del Sur" },
};

const almondsSecondLot: StockLot = {
  id: "lot-2",
  lotNumber: "L-2409",
  expiresOn: "2027-02-28",
  technical: false,
  remaining: 7_850,
  valueCents: 8_022_700,
  unitCostCents: 1_022_000,
  origin: { kind: "purchase", purchasedOn: "2026-09-12", supplierName: "Distribuidora del Sur" },
};

export const almonds: StockBalance = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Almendras peladas",
  categoryId: "category-nuts",
  categoryName: "Frutos secos",
  saleUnit: "KG",
  active: true,
  balance: 12_150,
  valueCents: 12_400_100,
  unitCostCents: 1_020_584,
  lotCount: 2,
  correction: null,
  lots: [almondsFirstLot, almondsSecondLot],
};

const honeyLot: StockLot = {
  id: "lot-3",
  lotNumber: null,
  expiresOn: null,
  technical: false,
  remaining: 24_000,
  valueCents: 13_056_000,
  unitCostCents: 544_000,
  origin: { kind: "purchase", purchasedOn: "2026-09-20", supplierName: "Apícola Los Álamos" },
};

export const honey: StockBalance = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Miel pura de abeja 1 kg",
  categoryId: "category-grocery",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  active: true,
  balance: 24_000,
  valueCents: 13_056_000,
  unitCostCents: 544_000,
  lotCount: 1,
  correction: null,
  lots: [honeyLot],
};

const crackersTechnicalLot: StockLot = {
  id: "lot-4",
  lotNumber: null,
  expiresOn: null,
  technical: true,
  remaining: -4000,
  valueCents: null,
  unitCostCents: null,
  origin: { kind: "product_sales_without_lots" },
};

export const crackers: StockBalance = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Galletas de arroz integrales",
  categoryId: "category-grocery",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  active: true,
  balance: -4000,
  valueCents: null,
  unitCostCents: null,
  lotCount: 1,
  correction: "purchase_or_count",
  lots: [crackersTechnicalLot],
};

export const tea: StockBalance = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Té verde en hebras 100 g",
  categoryId: "category-grocery",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  active: true,
  balance: 0,
  valueCents: null,
  unitCostCents: null,
  lotCount: 0,
  correction: "purchase_or_count",
  lots: [],
};

const oatsLot: StockLot = {
  id: "lot-5",
  lotNumber: "L-1807",
  expiresOn: "2027-01-10",
  technical: false,
  remaining: 3000,
  valueCents: 270_000,
  unitCostCents: 90_000,
  origin: { kind: "purchase", purchasedOn: "2026-07-01", supplierName: "Molinos del Valle" },
};

export const oats: StockBalance = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "Avena arrollada",
  categoryId: "category-grocery",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  active: false,
  balance: 3000,
  valueCents: 270_000,
  unitCostCents: 90_000,
  lotCount: 1,
  correction: null,
  lots: [oatsLot],
};

export const yerba: StockBalance = {
  id: "66666666-6666-4666-8666-666666666666",
  name: "Yerba mate orgánica 500 g",
  categoryId: "category-grocery",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  active: true,
  balance: -3000,
  valueCents: -915_000,
  unitCostCents: 305_000,
  lotCount: 2,
  correction: "count",
  lots: [
    {
      id: "lot-6",
      lotNumber: "L-3001",
      expiresOn: "2027-03-01",
      technical: false,
      remaining: 2000,
      valueCents: 610_000,
      unitCostCents: 305_000,
      origin: { kind: "purchase", purchasedOn: "2026-08-20", supplierName: "Molinos del Valle" },
    },
    {
      id: "lot-7",
      lotNumber: "L-3002",
      expiresOn: "2027-04-01",
      technical: false,
      remaining: -5000,
      valueCents: -1_525_000,
      unitCostCents: 305_000,
      origin: { kind: "purchase", purchasedOn: "2026-09-02", supplierName: "Molinos del Valle" },
    },
  ],
};

export function stockBalanceList(
  products: StockBalance[],
  summary: StockBalanceList["summary"] = {
    productCount: products.length,
    valueCents: 0,
    withoutCostCount: 0,
  },
): StockBalanceList {
  return { products, summary };
}

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
  lotCount: 2,
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
  lotCount: null,
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

export function expectedBalance(
  product: StockBalance,
  balance: number,
  lots: StockProductBalance["lots"] = [],
): StockProductBalance {
  return { ...withoutBalance(product), balance, lots };
}

export const ALMONDS_FIRST_LOT_ID = "00000000-0000-4000-8000-0000000000a1";
export const ALMONDS_SECOND_LOT_ID = "00000000-0000-4000-8000-0000000000a2";

export const almondsExpectedByLot = expectedBalance(almonds, 12_400, [
  { id: ALMONDS_FIRST_LOT_ID, lotNumber: "L-2312", expiresOn: "2026-10-14", expected: 4_400 },
  { id: ALMONDS_SECOND_LOT_ID, lotNumber: null, expiresOn: null, expected: 8_000 },
]);

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

export const movementReasons: StockMovementReasonList = {
  reasons: [
    { kind: "loss", reason: "broken_or_spilled", directions: ["subtract"] },
    { kind: "loss", reason: "spoiled", directions: ["subtract"] },
    { kind: "loss", reason: "portioning_waste", directions: ["subtract"] },
    { kind: "loss", reason: "tasting_or_sample", directions: ["subtract"] },
    { kind: "loss", reason: "store_consumption", directions: ["subtract"] },
    { kind: "loss", reason: "theft", directions: ["subtract"] },
    { kind: "adjustment", reason: "purchase_correction", directions: ["add", "subtract"] },
    { kind: "adjustment", reason: "supplier_return", directions: ["subtract"] },
    { kind: "adjustment", reason: "batch_correction", directions: ["add", "subtract"] },
  ],
};

export function withoutBalance({ balance: _balance, ...product }: StockBalance): StockProduct {
  return product;
}

type InitialLot = InitialInventoryLotList["lots"][number];

export const initialLotAlmonds: InitialLot = {
  lotId: "00000000-0000-4000-8000-0000000000b1",
  productId: almonds.id,
  productName: almonds.name,
  categoryName: almonds.categoryName,
  saleUnit: "KG",
  expiresOn: "2026-12-01",
  counted: 4_400,
  withdrawn: false,
  remaining: 4_400,
  costIncomplete: false,
  unitCostCents: 1_018_000,
  valueCents: 4_479_200,
};

export const initialLotHoney: InitialLot = {
  lotId: "00000000-0000-4000-8000-0000000000b2",
  productId: honey.id,
  productName: honey.name,
  categoryName: honey.categoryName,
  saleUnit: "UNIT",
  expiresOn: null,
  counted: 24_000,
  withdrawn: false,
  remaining: 24_000,
  costIncomplete: false,
  unitCostCents: 544_000,
  valueCents: 13_056_000,
};

export const initialLotTeaWithoutCost: InitialLot = {
  lotId: "00000000-0000-4000-8000-0000000000b3",
  productId: tea.id,
  productName: tea.name,
  categoryName: tea.categoryName,
  saleUnit: "UNIT",
  expiresOn: "2027-03-15",
  counted: 12_000,
  withdrawn: false,
  remaining: 12_000,
  costIncomplete: true,
  unitCostCents: null,
  valueCents: null,
};

export const initialLotWithdrawnStillHeld: InitialLot = {
  lotId: "00000000-0000-4000-8000-0000000000b4",
  productId: almonds.id,
  productName: almonds.name,
  categoryName: almonds.categoryName,
  saleUnit: "KG",
  expiresOn: "2027-01-15",
  counted: 2_000,
  withdrawn: true,
  remaining: 1_500,
  costIncomplete: true,
  unitCostCents: null,
  valueCents: null,
};
