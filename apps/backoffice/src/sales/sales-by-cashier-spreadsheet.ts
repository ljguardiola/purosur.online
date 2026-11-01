import type { SalesByCashierBody } from "@purosur/contracts";
import { type Cell, cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";

type CashierRow = SalesByCashierBody["rows"][number];

const UNIDENTIFIED = "Sin identificar";

function cashierName(row: CashierRow): string {
  return row.name ?? UNIDENTIFIED;
}

function averageTicketCell(averageTicket: number | null): Cell {
  return averageTicket === null ? cell.empty() : cell.money(averageTicket);
}

export function salesByCashierSpreadsheet(
  shown: SalesByCashierBody,
  rows: readonly CashierRow[],
  registerLabel: string,
): Workbook {
  const topRow = shown.rows[0];
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Caja", cell.text(registerLabel)],
        ["Cajeros con ventas", cell.count(shown.totals.cashiers)],
        ["Más ventas", topRow === undefined ? cell.empty() : cell.text(cashierName(topRow))],
        ["Ticket promedio", averageTicketCell(shown.totals.average_ticket)],
      ]),
      {
        name: "Ventas por cajero",
        header: ["Cajero", "Sesiones", "Ventas", "Importe", "Ticket promedio"],
        rows: rows.map((row) => [
          cell.text(cashierName(row)),
          cell.count(row.sessions),
          cell.count(row.sales_count),
          cell.money(row.total),
          averageTicketCell(row.average_ticket),
        ]),
      },
    ],
  };
}
