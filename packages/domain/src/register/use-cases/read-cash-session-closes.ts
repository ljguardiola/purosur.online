import { type Clock, type ReportPeriod, reportPeriodOf } from "../../shared/index.js";
import {
  type CashSessionClosesSummary,
  cashSessionClosesSummary,
} from "../model/cash-session-closes.js";
import type { CashSessionClosesReportReader } from "./cash-session-closes-report-reader.js";

export interface ReadCashSessionClosesInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
}

export interface CashSessionClosesReport extends CashSessionClosesSummary {
  range: ReportPeriod;
}

export async function readCashSessionCloses(
  { reader, clock }: { reader: CashSessionClosesReportReader; clock: Clock },
  { locationId, asked, registerId }: ReadCashSessionClosesInput,
): Promise<CashSessionClosesReport> {
  const range = reportPeriodOf(asked, clock.now());
  const closes = await reader.closedCashSessions({ locationId, range, registerId });
  return { range, ...cashSessionClosesSummary(closes) };
}
