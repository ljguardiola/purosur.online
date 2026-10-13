import { argentinaCalendarDay, type Clock, compareSpanishText } from "../../shared/index.js";
import { daysToExpiry, expiryWindowEnd, isExpired } from "../model/lot-expiry.js";
import { type LotsValueSummary, lotsValueSummary, lotValueCents } from "../model/lot-value.js";
import type {
  ExpiringLotProduct,
  ExpiringLotReader,
  ExpiringLotRow,
} from "./expiring-lot-reader.js";

export interface ReadExpiringLotsInput {
  locationId: string;
}

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

export interface ExpiringLotsView {
  windowDays: number;
  lots: ExpiringLotView[];
  summary: LotsValueSummary;
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

export async function readExpiringLots(
  { expiringLots, clock }: { expiringLots: ExpiringLotReader; clock: Clock },
  { locationId }: ReadExpiringLotsInput,
): Promise<ExpiringLotsView> {
  const today = argentinaCalendarDay(clock.now());
  const windowDays = await expiringLots.expiryWarningWindowDays(locationId);
  const rows = await expiringLots.lotsExpiringBy(locationId, expiryWindowEnd(today, windowDays));
  const lots = rows
    .filter(
      (row): row is ExpiringLotRow & { expiresOn: string } =>
        row.expiresOn !== null && !row.technical && row.remaining > 0,
    )
    .map((row) => lotView(row, today))
    .sort(compareLots);
  return { windowDays, lots, summary: lotsValueSummary(lots) };
}
