import type { SalesByProductAndCategoryBody } from "@purosur/contracts";
import { type Cell, cell, type Workbook } from "../platform/spreadsheet/workbook";
import { shareOfTotal } from "../platform/share-of-total";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";
import { soldRowLabel } from "./sold-row-label";

type SoldRow = SalesByProductAndCategoryBody["rows"][number];

export function salesByProductAndCategorySpreadsheet(
  shown: SalesByProductAndCategoryBody,
  rows: readonly SoldRow[],
  registerLabel: string,
): Workbook {
  const byProduct = shown.group === "product";
  const topRow = shown.rows[0];
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Caja", cell.text(registerLabel)],
        ["Agrupar", cell.text(byProduct ? "Por producto" : "Por categoría")],
        ["Total vendido", cell.money(shown.totals.amount)],
        ["Cantidad (u)", cell.count(shown.totals.units)],
        ["Cantidad (kg)", cell.weight(shown.totals.thousandths)],
        [
          byProduct ? "Producto principal" : "Categoría principal",
          topRow === undefined ? cell.empty() : cell.text(soldRowLabel(topRow)),
        ],
      ]),
      {
        name: byProduct ? "Por producto" : "Por categoría",
        header: [
          byProduct ? "Producto" : "Categoría",
          "Cantidad (u)",
          "Cantidad (kg)",
          "Importe",
          "Parte del total",
        ],
        rows: rows.map(
          (row): Cell[] => [
            cell.text(soldRowLabel(row)),
            cell.count(row.units),
            cell.weight(row.thousandths),
            cell.money(row.amount),
            cell.percent(shareOfTotal(row.amount, shown.totals.amount) * 100),
          ],
        ),
      },
    ],
  };
}
