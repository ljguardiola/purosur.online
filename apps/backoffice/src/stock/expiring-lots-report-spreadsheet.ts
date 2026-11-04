import type { ExpiringLotsReportBody } from "@purosur/contracts";
import { formatProductDescription } from "@purosur/ui/formatters";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { stockQuantityCells } from "../platform/stock-quantity-cells";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";

export function expiringLotsReportSpreadsheet(shown: ExpiringLotsReportBody): Workbook {
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.period),
        ["Ventana de aviso de la sucursal (días)", cell.count(shown.window_days)],
        ["Lotes", cell.count(shown.summary.lot_count)],
        ["Valor al costo", cell.money(shown.summary.value_cents)],
        ["Sin costo", cell.count(shown.summary.without_cost_count)],
      ]),
      {
        name: "Lotes por vencer",
        header: [
          "Producto",
          "Categoría",
          "Lote",
          "Código",
          "Vence",
          "Días",
          "Cantidad (u)",
          "Cantidad (kg)",
          "Valor",
        ],
        rows: shown.lots.map((lot) => [
          cell.text(
            formatProductDescription({
              name: lot.product.name,
              brandName: lot.product.brand_name,
              netContent: lot.product.net_content,
            }),
          ),
          cell.text(lot.product.category_name),
          cell.text(lot.lot_name),
          cell.text(lot.lot_code),
          cell.day(lot.expires_on),
          cell.count(lot.days_to_expiry),
          ...stockQuantityCells(lot.remaining, lot.product.sale_unit),
          lot.value_cents === null ? cell.empty() : cell.money(lot.value_cents),
        ]),
      },
    ],
  };
}
