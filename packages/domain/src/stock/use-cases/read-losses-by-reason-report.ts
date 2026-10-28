import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import { lossesByReason, type ReasonLosses } from "../model/losses-by-reason.js";
import type { LossReader } from "./loss-reader.js";

export interface ReadLossesByReasonReportInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
}

export interface LossesByReasonReport {
  range: ReportPeriod;
  reasons: ReasonLosses[];
}

export async function readLossesByReasonReport(
  { reader, clock, zoneRules }: { reader: LossReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked }: ReadLossesByReasonReportInput,
): Promise<LossesByReasonReport> {
  const range = reportPeriodOf(asked, clock.now(), zoneRules.zoneRules());
  const records = await reader.lossesRecorded({ locationId, range });
  return { range, reasons: lossesByReason(records) };
}
