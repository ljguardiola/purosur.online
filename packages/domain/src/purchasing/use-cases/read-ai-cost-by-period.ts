import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import {
  type AiCostByPeriod,
  type AiCostGrouping,
  aiCostByPeriod,
} from "../model/ai-cost-report.js";
import type { AiCostReportReader } from "./ai-cost-report-reader.js";

export interface ReadAiCostByPeriodInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  groupBy: AiCostGrouping;
}

export interface AiCostByPeriodReport extends AiCostByPeriod {
  range: ReportPeriod;
}

export async function readAiCostByPeriod(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: AiCostReportReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked, groupBy }: ReadAiCostByPeriodInput,
): Promise<AiCostByPeriodReport> {
  const range = reportPeriodOf(asked, clock.now(), zoneRules.zoneRules());
  const calls = await reader.recordedCalls({ locationId, range });
  return { range, ...aiCostByPeriod(calls, groupBy) };
}
