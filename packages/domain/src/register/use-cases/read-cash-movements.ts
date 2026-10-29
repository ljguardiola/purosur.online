import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import { type CashMovementsSummary, cashMovementsSummary } from "../model/cash-movements-report.js";
import type { CashMovementsReportReader } from "./cash-movements-report-reader.js";

export interface ReadCashMovementsInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
}

export interface CashMovementsReport extends CashMovementsSummary {
  range: ReportPeriod;
}

export async function readCashMovements(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: CashMovementsReportReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked, registerId }: ReadCashMovementsInput,
): Promise<CashMovementsReport> {
  const range = reportPeriodOf(asked, clock.now(), zoneRules.zoneRules());
  const movements = await reader.reportedCashMovements({ locationId, range, registerId });
  return { range, ...cashMovementsSummary(movements) };
}
