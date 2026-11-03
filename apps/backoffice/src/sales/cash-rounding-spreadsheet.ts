import type { CashRoundingBody } from "@purosur/contracts";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";

export function cashRoundingSpreadsheet(shown: CashRoundingBody, registerLabel: string): Workbook {
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Caja", cell.text(registerLabel)],
        ["Redondeo", cell.money(shown.totals.rounded)],
        ["Ventas redondeadas", cell.count(shown.totals.rounded_sale_count)],
      ]),
      {
        name: "Redondeo en efectivo",
        header: ["Día", "Caja", "Redondeo", "Ventas redondeadas"],
        rows: shown.rows.map((row) => [
          cell.day(row.day),
          cell.text(row.register_name),
          cell.money(row.rounded),
          cell.count(row.rounded_sale_count),
        ]),
      },
    ],
  };
}
