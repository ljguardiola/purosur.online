import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import {
  type WeighedLinesCount,
  type WeighedLinesOfCashier,
  type WeighedLinesOfSession,
  weighedLinesByCashier,
  weighedLinesBySession,
  weighedLinesTotals,
} from "../model/hand-typed-weights-report.js";
import type { HandTypedWeightsReportReader } from "./hand-typed-weights-report-reader.js";

export interface ReadHandTypedWeightsInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
}

export interface HandTypedWeightsReport {
  range: ReportPeriod;
  cashiers: WeighedLinesOfCashier[];
  sessions: WeighedLinesOfSession[];
  totals: WeighedLinesCount;
}

export async function readHandTypedWeights(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: HandTypedWeightsReportReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked, registerId }: ReadHandTypedWeightsInput,
): Promise<HandTypedWeightsReport> {
  const range = reportPeriodOf(asked, clock.now(), zoneRules.zoneRules());
  const groups = await reader.weighedLinesOfCompletedSales({ locationId, range, registerId });
  return {
    range,
    cashiers: weighedLinesByCashier(groups),
    sessions: weighedLinesBySession(groups),
    totals: weighedLinesTotals(groups),
  };
}
