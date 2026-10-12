import {
  type StockCountBody,
  type StockProductBalance,
  stockCountBodySchema,
} from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import { parseStockQuantity, quantityMessage } from "../platform/stock-quantity";
import type { CountMoment } from "./count-moment";

export type CountMode = "product" | "lots";

export type CountLot = StockProductBalance["lots"][number];

export type CountFormValues = {
  productId: string | null;
  moment: CountMoment;
  mode: CountMode;
  counted: string;
  lots: Record<string, string>;
};

const LOTS_CHANGED = "Los lotes del producto cambiaron. Elegí el producto de nuevo.";

export function countedMode(mode: CountMode, lots: readonly CountLot[]): CountMode {
  return mode === "lots" && lots.length > 0 ? "lots" : "product";
}

function lotCounted(typed: string | undefined, saleUnit: SaleUnit): number {
  if (typed === undefined || typed.trim() === "") {
    return 0;
  }
  return parseStockQuantity(typed, saleUnit) ?? Number.NaN;
}

export function countBody(
  { productId, mode, counted, lots: typed }: Omit<CountFormValues, "moment">,
  { saleUnit, lots, at }: { saleUnit: SaleUnit; lots: readonly CountLot[]; at: string | undefined },
): StockCountBody {
  const common = { productId: productId ?? "", occurredAt: at ?? "" };
  if (countedMode(mode, lots) === "lots") {
    return {
      ...common,
      lots: lots.map((lot) => ({ lotId: lot.id, counted: lotCounted(typed[lot.id], saleUnit) })),
    };
  }
  return { ...common, counted: parseStockQuantity(counted, saleUnit) ?? Number.NaN };
}

export function lotsTotal(
  typed: Record<string, string>,
  lots: readonly CountLot[],
  saleUnit: SaleUnit,
): number | undefined {
  const quantities = lots.map((lot) => lotCounted(typed[lot.id], saleUnit));
  return quantities.some(Number.isNaN)
    ? undefined
    : quantities.reduce((sum, each) => sum + each, 0);
}

export function lotsMessage(
  typed: Record<string, string>,
  lots: readonly CountLot[],
  saleUnit: SaleUnit,
): string {
  const accepted = stockCountBodySchema.shape.lots.safeParse(
    lots.map((lot) => ({ lotId: lot.id, counted: lotCounted(typed[lot.id], saleUnit) })),
  ).success;
  return accepted ? LOTS_CHANGED : quantityMessage(saleUnit);
}
