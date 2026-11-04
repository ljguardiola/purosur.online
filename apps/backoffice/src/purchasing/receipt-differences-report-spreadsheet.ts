import type { ReceiptDifferencesBody } from "@purosur/contracts";
import { formatProductDescription } from "@purosur/ui/formatters";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { stockQuantityCells } from "../platform/stock-quantity-cells";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";

export function receiptDifferencesReportSpreadsheet(shown: ReceiptDifferencesBody): Workbook {
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Líneas con faltante", cell.count(shown.totals.short_lines)],
        ["Líneas con diferencia de precio", cell.count(shown.totals.price_difference_lines)],
        ["Diferencia de precio neta", cell.money(shown.totals.price_difference_cents)],
        ["Proveedores", cell.count(shown.totals.suppliers)],
      ]),
      {
        name: "Diferencias de recepción",
        header: [
          "Proveedor",
          "Mes",
          "Día de recepción",
          "Producto",
          "Recibido (u)",
          "Recibido (kg)",
          "Faltante (u)",
          "Faltante (kg)",
          "Diferencia de precio",
        ],
        rows: shown.suppliers.flatMap((supplier) =>
          supplier.months.flatMap((month) =>
            month.lines.map((line) => [
              cell.text(supplier.name),
              cell.month(month.month),
              cell.day(line.received_on),
              cell.text(formatProductDescription(line.product)),
              ...stockQuantityCells(line.received_quantity, line.product.saleUnit),
              ...stockQuantityCells(line.missing_quantity, line.product.saleUnit),
              line.price_difference_cents === null
                ? cell.empty()
                : cell.money(line.price_difference_cents),
            ]),
          ),
        ),
      },
    ],
  };
}
