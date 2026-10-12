import type { SaleUnit } from "../../catalog/index.js";
import { type InitialCountCostFilter, initialCountCostIncomplete } from "../model/initial-count.js";
import { lotValueCents } from "../model/lot-value.js";
import { lotUnitCostCents } from "../model/unit-cost.js";
import type { InitialCountLotReader } from "./initial-count-lot-reader.js";

export interface ReadInitialCountLotsInput {
  locationId: string;
  cost?: InitialCountCostFilter;
  productName?: string;
}

export interface InitialCountLotView {
  lotId: string;
  productId: string;
  productName: string;
  categoryName: string;
  saleUnit: SaleUnit;
  expiresOn: string | null;
  counted: number;
  costIncomplete: boolean;
  unitCostCents: number | null;
  valueCents: number | null;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareExpiry(a: string | null, b: string | null): number {
  if (a === null || b === null) {
    return Number(a === null) - Number(b === null);
  }
  return compareText(a, b);
}

export async function readInitialCountLots(
  { initialCountLots }: { initialCountLots: InitialCountLotReader },
  { locationId, cost, productName }: ReadInitialCountLotsInput,
): Promise<InitialCountLotView[]> {
  const rows = await initialCountLots.notWithdrawnInitialCountLots({
    locationId,
    costIncomplete: cost === undefined ? undefined : initialCountCostIncomplete(cost),
    productName,
  });
  return rows
    .map((row) => ({
      lotId: row.lotId,
      productId: row.productId,
      productName: row.productName,
      categoryName: row.categoryName,
      saleUnit: row.saleUnit,
      expiresOn: row.expiresOn,
      counted: row.counted,
      costIncomplete: row.costIncomplete,
      unitCostCents: lotUnitCostCents(row),
      valueCents: lotValueCents({ ...row, remaining: row.counted }),
    }))
    .sort(
      (a, b) =>
        compareText(a.productName, b.productName) ||
        compareExpiry(a.expiresOn, b.expiresOn) ||
        compareText(a.lotId, b.lotId),
    );
}
