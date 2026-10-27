import { compareSpanishText } from "../../shared/index.js";
import { canExpireWithStock, daysToExpiry, isExpired } from "../model/lot-expiry.js";
import { lotValueCents } from "../model/lot-value.js";
import type { ExpiringLotProduct, ExpiringLotRow } from "./expiring-lot-reader.js";

export interface ExpiringLotView {
  id: string;
  lotNumber: string | null;
  expiresOn: string;
  remaining: number;
  valueCents: number | null;
  expired: boolean;
  daysToExpiry: number;
  product: ExpiringLotProduct;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareLots(a: ExpiringLotView, b: ExpiringLotView): number {
  return (
    compareText(a.expiresOn, b.expiresOn) ||
    compareSpanishText(a.product.name, b.product.name) ||
    compareText(a.id, b.id)
  );
}

function lotView(row: ExpiringLotRow & { expiresOn: string }, today: string): ExpiringLotView {
  return {
    id: row.id,
    lotNumber: row.lotNumber,
    expiresOn: row.expiresOn,
    remaining: row.remaining,
    valueCents: lotValueCents(row),
    expired: isExpired(row.expiresOn, today),
    daysToExpiry: daysToExpiry(row.expiresOn, today),
    product: row.product,
  };
}

export function listExpiringLots(
  rows: readonly ExpiringLotRow[],
  today: string,
): ExpiringLotView[] {
  return rows
    .filter((row): row is ExpiringLotRow & { expiresOn: string } => canExpireWithStock(row))
    .map((row) => lotView(row, today))
    .sort(compareLots);
}
