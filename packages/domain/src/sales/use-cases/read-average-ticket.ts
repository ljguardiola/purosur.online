import { type Clock, type ReportPeriod, reportPeriodOf } from "../../shared/index.js";
import { averageTicket } from "../model/average-ticket.js";
import {
  previousReportPeriod,
  type SalesOfWeek,
  salesOfWeeks,
  ticketChangeTenths,
} from "../model/average-ticket-report.js";
import { type SalesReportTotals, salesReportTotals } from "../model/sales-report.js";
import type { SalesReportReader } from "./sales-report-reader.js";

export interface ReadAverageTicketInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
}

export interface TicketOfPeriod extends SalesReportTotals {
  averageTicket: number | null;
}

export interface AverageTicketReport {
  range: ReportPeriod;
  previousRange: ReportPeriod | null;
  current: TicketOfPeriod;
  previous: TicketOfPeriod | null;
  changeTenths: number | null;
  weeks: SalesOfWeek[];
}

function ticketOf(totals: SalesReportTotals): TicketOfPeriod {
  return { ...totals, averageTicket: averageTicket(totals) };
}

export async function readAverageTicket(
  { reader, clock }: { reader: SalesReportReader; clock: Clock },
  { locationId, asked, registerId }: ReadAverageTicketInput,
): Promise<AverageTicketReport> {
  const range = reportPeriodOf(asked, clock.now());
  const previousRange = previousReportPeriod(range);
  const days = await reader.completedSalesByDay({ locationId, range, registerId });
  const previous =
    previousRange === null
      ? null
      : ticketOf(
          salesReportTotals(
            await reader.completedSalesByDay({ locationId, range: previousRange, registerId }),
          ),
        );
  const current = ticketOf(salesReportTotals(days));
  return {
    range,
    previousRange,
    current,
    previous,
    changeTenths: ticketChangeTenths({
      current: current.averageTicket,
      previous: previous?.averageTicket ?? null,
    }),
    weeks: salesOfWeeks(range, days),
  };
}
