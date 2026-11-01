import type { AverageTicketBody } from "@purosur/contracts";
import { type Cell, cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";

type WeekRow = AverageTicketBody["weeks"][number];

const TENTHS_PER_PERCENT = 10;

function averageTicketCell(averageTicket: number | null): Cell {
  return averageTicket === null ? cell.empty() : cell.money(averageTicket);
}

export function averageTicketSpreadsheet(
  shown: AverageTicketBody,
  weeks: readonly WeekRow[],
  registerLabel: string,
): Workbook {
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Caja", cell.text(registerLabel)],
        ["Ticket promedio", averageTicketCell(shown.current.average_ticket)],
        ["Ventas", cell.count(shown.current.sales_count)],
        ["Período anterior", averageTicketCell(shown.previous?.average_ticket ?? null)],
        [
          "Desde (período anterior)",
          shown.previous_range === null ? cell.empty() : cell.day(shown.previous_range.from),
        ],
        [
          "Hasta (período anterior)",
          shown.previous_range === null ? cell.empty() : cell.day(shown.previous_range.to),
        ],
        [
          "Diferencia",
          shown.change_tenths === null
            ? cell.empty()
            : cell.percent(shown.change_tenths / TENTHS_PER_PERCENT),
        ],
      ]),
      {
        name: "Ticket promedio por semana",
        header: ["Desde", "Hasta", "Ventas", "Importe", "Ticket promedio"],
        rows: weeks.map((row) => [
          cell.day(row.from),
          cell.day(row.to),
          cell.count(row.sales_count),
          cell.money(row.total),
          averageTicketCell(row.average_ticket),
        ]),
      },
    ],
  };
}
