import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import {
  type DiscountAuthorizer,
  type ManualDiscountRow,
  type ManualDiscountTotals,
  manualDiscountAuthorizers,
  manualDiscountRows,
  manualDiscountTotals,
} from "../model/manual-discounts-report.js";
import type { ManualDiscountsReportReader } from "./manual-discounts-report-reader.js";

export interface ReadManualDiscountsInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
  authorizedBy: string | undefined;
}

export interface ManualDiscountsReport {
  range: ReportPeriod;
  rows: ManualDiscountRow[];
  totals: ManualDiscountTotals;
  authorizers: DiscountAuthorizer[];
}

export async function readManualDiscounts(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: ManualDiscountsReportReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked, registerId, authorizedBy }: ReadManualDiscountsInput,
): Promise<ManualDiscountsReport> {
  const range = reportPeriodOf(asked, clock.now(), zoneRules.zoneRules());
  const records = await reader.completedManualDiscounts({ locationId, range, registerId });
  const everyRow = manualDiscountRows(records);
  const rows =
    authorizedBy === undefined
      ? everyRow
      : everyRow.filter((row) => row.authorizer.id === authorizedBy);
  return {
    range,
    rows,
    totals: manualDiscountTotals(rows),
    authorizers: manualDiscountAuthorizers(everyRow),
  };
}
