import { compareSpanishText } from "../../shared/index.js";
import { canExpireWithStock, daysToExpiry, isExpired } from "../model/lot-expiry.js";
import type { LotName } from "../model/lot-name.js";
import { lotValueCents } from "../model/lot-value.js";
import type { ExpiringLotProduct, ExpiringLotRow } from "./expiring-lot-reader.js";
import { nameOf } from "./name-lots.js";

export interface ExpiringLotView {
  id: string;
  name: LotName;
  code: number;
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

function lotView(
  row: ExpiringLotRow & { expiresOn: string },
  today: string,
  names: ReadonlyMap<string, LotName>,
): ExpiringLotView {
  return {
    id: row.id,
    name: nameOf(names, row.id),
    code: row.code,
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
  names: ReadonlyMap<string, LotName>,
): ExpiringLotView[] {
  return rows
    .filter((row): row is ExpiringLotRow & { expiresOn: string } => canExpireWithStock(row))
    .map((row) => lotView(row, today, names))
    .sort(compareLots);
}

export function productIdsOf(rows: readonly ExpiringLotRow[]): string[] {
  return [...new Set(rows.map((row) => row.product.id))];
}
