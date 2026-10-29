import type { SaleUnit } from "../../catalog/index.js";
import { cheapestOffer, compareSpanishText } from "../../shared/index.js";
import {
  type InitialCountCostFilter,
  initialCountCostIncomplete,
  initialCountLotTakesCost,
} from "../model/initial-count.js";
import {
  lotCostIsPrice,
  referenceCostOfPrice,
  selectableSupplierPrices,
} from "../model/lot-reference-cost.js";
import { knownLotCost, lotValueCents } from "../model/lot-value.js";
import { lotUnitCostCents, unitCostCents } from "../model/unit-cost.js";
import type { InitialCountLotReader, InitialCountLotRow } from "./initial-count-lot-reader.js";

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
  withdrawn: boolean;
  remaining: number;
  costIncomplete: boolean;
  unitCostCents: number | null;
  valueCents: number | null;
  // Cheapest first.
  supplierPrices: InitialCountLotSupplierPrice[];
}

export interface InitialCountLotSupplierPrice {
  supplierItemId: string;
  supplierName: string;
  packagingName: string;
  listDate: string;
  unitCostCents: number;
  cheapest: boolean;
  current: boolean;
}

function supplierPricesOf(row: InitialCountLotRow): InitialCountLotSupplierPrice[] {
  const known = knownLotCost(row);
  const selectable = selectableSupplierPrices(row.supplierPrices);
  const cheapest = cheapestOffer(selectable);
  return selectable.flatMap((price) => {
    const cost = referenceCostOfPrice(price.pricePerSaleUnit);
    return cost === null
      ? []
      : [
          {
            supplierItemId: price.supplierItemId,
            supplierName: price.supplierName,
            packagingName: price.packagingName,
            listDate: price.listDate,
            unitCostCents: unitCostCents(cost.totalCents, cost.quantity),
            cheapest: price === cheapest,
            current: lotCostIsPrice(known, price.pricePerSaleUnit),
          },
        ];
  });
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
  const rows = await initialCountLots.initialCountLots({
    locationId,
    costIncomplete: cost === undefined ? undefined : initialCountCostIncomplete(cost),
    productName,
  });
  return rows
    .filter(initialCountLotTakesCost)
    .map((row) => ({
      lotId: row.lotId,
      productId: row.productId,
      productName: row.productName,
      categoryName: row.categoryName,
      saleUnit: row.saleUnit,
      expiresOn: row.expiresOn,
      counted: row.counted,
      withdrawn: row.withdrawn,
      remaining: row.remaining,
      costIncomplete: row.costIncomplete,
      unitCostCents: lotUnitCostCents(row),
      valueCents: lotValueCents({ ...row, remaining: row.withdrawn ? row.remaining : row.counted }),
      supplierPrices: supplierPricesOf(row),
    }))
    .sort(
      (a, b) =>
        compareSpanishText(a.productName, b.productName) ||
        compareExpiry(a.expiresOn, b.expiresOn) ||
        compareText(a.lotId, b.lotId),
    );
}
