import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import { type FreightByPeriod, freightByPeriod } from "../model/freight-by-period-report.js";
import type { FreightReportReader } from "./freight-report-reader.js";

export interface ReadFreightByPeriodInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
}

export interface FreightByPeriodReport extends FreightByPeriod {
  range: ReportPeriod;
}

export async function readFreightByPeriod(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: FreightReportReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked }: ReadFreightByPeriodInput,
): Promise<FreightByPeriodReport> {
  const range = reportPeriodOf(asked, clock.now(), zoneRules.zoneRules());
  const freights = await reader.registeredFreights({ locationId, range });
  return { range, ...freightByPeriod(freights) };
}
