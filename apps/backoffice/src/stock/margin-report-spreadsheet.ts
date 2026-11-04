import type { MarginReportBody } from "@purosur/contracts";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";
import { marginRowLabel } from "./margin-row-label";

type MarginRow = MarginReportBody["rows"][number];

function marginPercentCell(tenths: number | null) {
  return tenths === null ? cell.empty() : cell.percent(tenths / 10);
}

export function marginReportSpreadsheet(
  shown: MarginReportBody,
  rows: readonly MarginRow[],
  registerLabel: string,
): Workbook {
  const byProduct = shown.group === "product";
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Caja", cell.text(registerLabel)],
        ["Agrupar", cell.text(byProduct ? "Por producto" : "Por categoría")],
        ["Vendido", cell.money(shown.totals.amount)],
        ["Costo", cell.money(shown.totals.cost)],
        ["Margen", cell.money(shown.totals.margin)],
        ["Margen %", marginPercentCell(shown.totals.marginTenthsOfPercent)],
        ["Ventas con costo incompleto", cell.count(shown.totals.incompleteSales)],
      ]),
      {
        name: byProduct ? "Por producto" : "Por categoría",
        header: [
          byProduct ? "Producto" : "Categoría",
          "Vendido",
          "Costo",
          "Costo incompleto (ventas)",
          "Margen",
          "Margen %",
        ],
        rows: rows.map((row) => [
          cell.text(marginRowLabel(row)),
          cell.money(row.amount),
          cell.money(row.cost),
          cell.count(row.incompleteSales),
          cell.money(row.margin),
          marginPercentCell(row.marginTenthsOfPercent),
        ]),
      },
    ],
  };
}
