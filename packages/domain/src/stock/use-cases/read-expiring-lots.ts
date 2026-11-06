import { argentinaCalendarDay, type Clock, type ZoneRulesSource } from "../../shared/index.js";
import { expiryWindowEnd } from "../model/lot-expiry.js";
import { type LotsValueSummary, lotsValueSummary } from "../model/lot-value.js";
import type { ExpiringLotReader, ExpiryWarningWindowReader } from "./expiring-lot-reader.js";
import { type ExpiringLotView, listExpiringLots, productIdsOf } from "./list-expiring-lots.js";
import type { LotNameReader } from "./lot-name-reader.js";
import { nameLotsOfProducts } from "./name-lots.js";

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
    lotNames,
    expiryWarningWindow,
    clock,
    zoneRules,
  }: {
    expiringLots: ExpiringLotReader;
    lotNames: LotNameReader;
    expiryWarningWindow: ExpiryWarningWindowReader;
    clock: Clock;
    zoneRules: ZoneRulesSource;
  },
  { locationId }: ReadExpiringLotsInput,
): Promise<ExpiringLotsView> {
  const today = argentinaCalendarDay(clock.now(), zoneRules.zoneRules());
  const windowDays = await expiryWarningWindow.expiryWarningWindowDays(locationId);
  const rows = await expiringLots.lotsExpiringBy(locationId, expiryWindowEnd(today, windowDays));
  const names = await nameLotsOfProducts({ lotNames, zoneRules }, locationId, productIdsOf(rows));
  const lots = listExpiringLots(rows, today, names);
  return { windowDays, lots, summary: lotsValueSummary(lots) };
}
