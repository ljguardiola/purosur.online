import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import { type ReceiptDifferences, receiptDifferences } from "../model/receipt-differences-report.js";
import type { ReceiptDifferencesReader } from "./receipt-differences-reader.js";

export interface ReadReceiptDifferencesInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
}

export interface ReceiptDifferencesReport extends ReceiptDifferences {
  range: ReportPeriod;
}

export async function readReceiptDifferences(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: ReceiptDifferencesReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked }: ReadReceiptDifferencesInput,
): Promise<ReceiptDifferencesReport> {
  const range = reportPeriodOf(asked, clock.now(), zoneRules.zoneRules());
  const rows = await reader.receiptLines({ locationId, range });
  return { range, ...receiptDifferences(rows) };
}
