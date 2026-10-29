import type { SaleUnit } from "../../catalog/index.js";
import {
  type CurrentStockSummary,
  currentStockSummary,
  holdsCurrentStock,
} from "../model/current-stock-summary.js";
import type { ProductBrandAndNetContent } from "../model/product-brand-and-net-content.js";
import type { CurrentStockReader } from "./current-stock-reader.js";
import { readStockBalances, type StockBalanceView } from "./read-stock-balances.js";

export interface ReadCurrentStockReportInput {
  locationId: string;
  categoryId?: string;
}

export interface CurrentStockLot {
  id: string;
  lotNumber: string | null;
  expiresOn: string | null;
  technical: boolean;
  remaining: number;
  unitCostCents: number | null;
  valueCents: number | null;
}

export interface CurrentStockProduct extends ProductBrandAndNetContent {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  saleUnit: SaleUnit;
  balance: number;
  valueCents: number | null;
  lots: CurrentStockLot[];
}

export interface CurrentStockCategory {
  id: string;
  name: string;
}

export interface CurrentStockReport {
  products: CurrentStockProduct[];
  categories: CurrentStockCategory[];
  summary: CurrentStockSummary;
}

function productOf(balance: StockBalanceView): CurrentStockProduct {
  return {
    id: balance.id,
    name: balance.name,
    brandName: balance.brandName,
    netContent: balance.netContent,
    categoryId: balance.categoryId,
    categoryName: balance.categoryName,
    saleUnit: balance.saleUnit,
    balance: balance.balance,
    valueCents: balance.valueCents,
    lots: balance.lots.map(
      ({ id, lotNumber, expiresOn, technical, remaining, unitCostCents, valueCents }) => ({
        id,
        lotNumber,
        expiresOn,
        technical,
        remaining,
        unitCostCents,
        valueCents,
      }),
    ),
  };
}

function categoriesOf(products: readonly CurrentStockProduct[]): CurrentStockCategory[] {
  const names = new Map(products.map(({ categoryId, categoryName }) => [categoryId, categoryName]));
  return [...names].map(([id, name]) => ({ id, name }));
}

export async function readCurrentStockReport(
  { currentStock }: { currentStock: CurrentStockReader },
  { locationId, categoryId }: ReadCurrentStockReportInput,
): Promise<CurrentStockReport> {
  const { products: balances } = await readStockBalances(
    { stockList: { stockLevels: (location) => currentStock.everyStockLevel(location) } },
    { locationId },
  );
  const held = balances
    .filter(({ balance, lotCount }) => holdsCurrentStock({ balance, lotCount }))
    .map(productOf);
  const listed =
    categoryId === undefined ? held : held.filter((product) => product.categoryId === categoryId);
  return {
    products: listed,
    categories: categoriesOf(held),
    summary: currentStockSummary(listed),
  };
}
