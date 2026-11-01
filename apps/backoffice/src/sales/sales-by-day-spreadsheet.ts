import type { SalesReportBody } from "@purosur/contracts";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";

export function salesByDaySpreadsheet(shown: SalesReportBody, registerLabel: string): Workbook {
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Caja", cell.text(registerLabel)],
        ["Total vendido", cell.money(shown.totals.total)],
        ["Cantidad de ventas", cell.count(shown.totals.sales_count)],
      ]),
      {
        name: "Ventas por día",
        header: ["Día", "Ventas", "Total"],
        rows: shown.days.map((sales) => [
          cell.day(sales.day),
          cell.count(sales.sales_count),
          cell.money(sales.total),
        ]),
      },
    ],
  };
}
