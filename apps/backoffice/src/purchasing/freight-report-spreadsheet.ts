import type { FreightByPeriodBody } from "@purosur/contracts";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";
import { reportMonthText } from "./report-month-text";

export function freightReportSpreadsheet(shown: FreightByPeriodBody): Workbook {
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Total de fletes", cell.money(shown.totals.amount)],
        ["Fletes", cell.count(shown.totals.freights)],
      ]),
      {
        name: "Flete por período",
        header: ["Mes", "Fletes", "Monto"],
        rows: shown.months.map((month) => [
          cell.text(reportMonthText(month.month)),
          cell.count(month.freights),
          cell.money(month.amount),
        ]),
      },
    ],
  };
}
