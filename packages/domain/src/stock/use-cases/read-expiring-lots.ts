import { argentinaCalendarDay, type Clock } from "../../shared/index.js";
import { expiryWindowEnd } from "../model/lot-expiry.js";
import { type LotsValueSummary, lotsValueSummary } from "../model/lot-value.js";
import type { ExpiringLotReader, ExpiryWarningWindowReader } from "./expiring-lot-reader.js";
import { type ExpiringLotView, listExpiringLots } from "./list-expiring-lots.js";

export interface ReadExpiringLotsInput {
  locationId: string;
}

export interface ExpiringLotsView {
  windowDays: number;
  lots: ExpiringLotView[];
  summary: LotsValueSummary;
}

export async function readExpiringLots(
  {
    expiringLots,
    branchSettings,
    clock,
  }: {
    expiringLots: ExpiringLotReader;
    branchSettings: ExpiryWarningWindowReader;
    clock: Clock;
  },
  { locationId }: ReadExpiringLotsInput,
): Promise<ExpiringLotsView> {
  const today = argentinaCalendarDay(clock.now());
  const { expiringLotAlertDays: windowDays } =
    await branchSettings.currentBranchSettings(locationId);
  const rows = await expiringLots.lotsExpiringBy(locationId, expiryWindowEnd(today, windowDays));
  const lots = listExpiringLots(rows, today);
  return { windowDays, lots, summary: lotsValueSummary(lots) };
}
