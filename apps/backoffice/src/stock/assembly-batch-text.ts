import type { SaleUnit } from "@purosur/domain";
import { formatCalendarDayNumeric, formatNumber, plural } from "@purosur/ui";
import { formatStockUnitCost } from "./stock-cost";
import { formatStockDay } from "./stock-period";

export const BATCH_COST_INCOMPLETE = "Costo incompleto";
export const BATCH_WITHOUT_EXPIRY = "Sin vencimiento";

export function batchUnitCostText(
  { unitCostCents, costIncomplete }: { unitCostCents: number | null; costIncomplete: boolean },
  saleUnit: SaleUnit,
): string | null {
  return unitCostCents === null || costIncomplete
    ? null
    : formatStockUnitCost(unitCostCents, saleUnit);
}

export function batchDayText(assembledAt: string): string {
  return `Tanda del ${formatStockDay(assembledAt)}`;
}

export function batchExpiryText(expiresOn: string | null): string {
  return expiresOn === null ? BATCH_WITHOUT_EXPIRY : formatCalendarDayNumeric(expiresOn);
}

export function assemblyBatchesCountText(count: number, days: number): string {
  const batches = plural(count, { one: "1 tanda", other: `${formatNumber(count)} tandas` });
  return `${batches} en los últimos ${formatNumber(days)} días`;
}
