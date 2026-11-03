import {
  argentinaCalendarDay,
  type Clock,
  type ReportPeriod,
  type ZoneRulesSource,
} from "../../shared/index.js";
import { expiryReportPeriodOf } from "../model/lot-expiry.js";
import { type LotsValueSummary, lotsValueSummary } from "../model/lot-value.js";
import type { ExpiringLotReader, ExpiryWarningWindowReader } from "./expiring-lot-reader.js";
import { type ExpiringLotView, listExpiringLots, productIdsOf } from "./list-expiring-lots.js";
import type { LotNameReader } from "./lot-name-reader.js";
import { nameLotsOfProducts } from "./name-lots.js";

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
    lotNames,
    branchSettings,
    clock,
    zoneRules,
  }: {
    expiringLots: ExpiringLotReader;
    lotNames: LotNameReader;
    branchSettings: ExpiryWarningWindowReader;
    clock: Clock;
    zoneRules: ZoneRulesSource;
  },
  { locationId, asked }: ReadExpiringLotsReportInput,
): Promise<ExpiringLotsReport> {
  const today = argentinaCalendarDay(clock.now(), zoneRules.zoneRules());
  const { expiringLotAlertDays: windowDays } =
    await branchSettings.currentBranchSettings(locationId);
  const period = expiryReportPeriodOf(asked, today, windowDays);
  const rows = await expiringLots.lotsExpiringBy(locationId, period.to);
  const names = await nameLotsOfProducts({ lotNames, zoneRules }, locationId, productIdsOf(rows));
  const lots = listExpiringLots(rows, today, names).filter(
    ({ expiresOn }) => expiresOn >= period.from,
  );
  return {
    period,
    windowDays,
    lots,
    summary: { lotCount: lots.length, ...lotsValueSummary(lots) },
  };
}
