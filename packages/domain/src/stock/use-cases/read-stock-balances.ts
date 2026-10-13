import { compareFirstToConsume } from "../model/lot-allocation.js";
import { lotValueCents } from "../model/lot-value.js";
import {
  productUnitCostCents,
  productValueCents,
  type StockCorrection,
  stockCorrection,
} from "../model/product-valuation.js";
import { type StockBalancesSummary, stockBalancesSummary } from "../model/stock-balance.js";
import { lotUnitCostCents } from "../model/unit-cost.js";
import type { LotInStock, StockLevel, StockListReader, StockProduct } from "./stock-reader.js";

export interface ReadStockBalancesInput {
  locationId: string;
}

export type LotOrigin =
  | { kind: "purchase"; purchasedOn: string; supplierName: string }
  | { kind: "initial_count" }
  | { kind: "product_sales_without_lots" };

export interface StockLotView {
  id: string;
  lotNumber: string | null;
  expiresOn: string | null;
  technical: boolean;
  remaining: number;
  valueCents: number | null;
  unitCostCents: number | null;
  origin: LotOrigin;
}

export interface StockBalanceView extends StockProduct {
  balance: number;
  valueCents: number | null;
  unitCostCents: number | null;
  lotCount: number;
  correction: StockCorrection | null;
  lots: StockLotView[];
}

export interface StockBalancesView {
  products: StockBalanceView[];
  summary: StockBalancesSummary;
}

function purchasedOn(lot: LotInStock): string | null {
  return lot.purchase?.purchasedOn ?? null;
}

function originOf(lot: LotInStock): LotOrigin {
  if (lot.purchase) {
    return { kind: "purchase", ...lot.purchase };
  }
  return lot.initialCount ? { kind: "initial_count" } : { kind: "product_sales_without_lots" };
}

function lotView(lot: LotInStock): StockLotView {
  return {
    id: lot.id,
    lotNumber: lot.lotNumber,
    expiresOn: lot.expiresOn,
    technical: lot.purchase === null && !lot.initialCount,
    remaining: lot.remaining,
    valueCents: lotValueCents(lot),
    unitCostCents: lotUnitCostCents(lot),
    origin: originOf(lot),
  };
}

function balanceView({ lots, hasMoved: _, ...level }: StockLevel): StockBalanceView {
  const inConsumptionOrder = [...lots].sort((a, b) =>
    compareFirstToConsume(
      { id: a.id, expiresOn: a.expiresOn, purchasedOn: purchasedOn(a) },
      { id: b.id, expiresOn: b.expiresOn, purchasedOn: purchasedOn(b) },
    ),
  );
  const lotViews = inConsumptionOrder.map(lotView);
  const valueCents = productValueCents(lotViews.map((lot) => lot.valueCents));
  return {
    ...level,
    valueCents,
    unitCostCents: productUnitCostCents({ valueCents, balance: level.balance }),
    lotCount: lotViews.length,
    correction: stockCorrection({
      balance: level.balance,
      hasPurchasedLot: lotViews.some((lot) => !lot.technical),
    }),
    lots: lotViews,
  };
}

export async function readStockBalances(
  { stockList }: { stockList: Pick<StockListReader, "stockLevels"> },
  { locationId }: ReadStockBalancesInput,
): Promise<StockBalancesView> {
  const levels = await stockList.stockLevels(locationId);
  const balances = levels.map((level) => ({ hasMoved: level.hasMoved, view: balanceView(level) }));
  return {
    products: balances.map(({ view }) => view),
    summary: stockBalancesSummary(
      balances.map(({ hasMoved, view }) => ({ hasMoved, valueCents: view.valueCents })),
    ),
  };
}
