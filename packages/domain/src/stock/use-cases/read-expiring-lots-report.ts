import { argentinaCalendarDay, type Clock, type ReportPeriod } from "../../shared/index.js";
import { expiryReportPeriodOf } from "../model/lot-expiry.js";
import { type LotsValueSummary, lotsValueSummary } from "../model/lot-value.js";
import type { ExpiringLotReader, ExpiryWarningWindowReader } from "./expiring-lot-reader.js";
import { type ExpiringLotView, listExpiringLots } from "./list-expiring-lots.js";

export interface ReadExpiringLotsReportInput {
  locationId: string;
  asked: { from?: string; to?: string };
}

export interface ExpiringLotsReportSummary extends LotsValueSummary {
  lotCount: number;
}

export interface ExpiringLotsReport {
  period: ReportPeriod;
  windowDays: number;
  lots: ExpiringLotView[];
  summary: ExpiringLotsReportSummary;
}

export async function readExpiringLotsReport(
  {
    expiringLots,
    branchSettings,
    clock,
  }: {
    expiringLots: ExpiringLotReader;
    branchSettings: ExpiryWarningWindowReader;
    clock: Clock;
  },
  { locationId, asked }: ReadExpiringLotsReportInput,
): Promise<ExpiringLotsReport> {
  const today = argentinaCalendarDay(clock.now());
  const { expiringLotAlertDays: windowDays } =
    await branchSettings.currentBranchSettings(locationId);
  const period = expiryReportPeriodOf(asked, today, windowDays);
  const rows = await expiringLots.lotsExpiringBy(locationId, period.to);
  const lots = listExpiringLots(rows, today).filter(({ expiresOn }) => expiresOn >= period.from);
  return {
    period,
    windowDays,
    lots,
    summary: { lotCount: lots.length, ...lotsValueSummary(lots) },
  };
}
