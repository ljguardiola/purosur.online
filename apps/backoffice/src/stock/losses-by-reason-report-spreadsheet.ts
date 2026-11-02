import type { LossesByReasonReportBody } from "@purosur/contracts";
import { formatProductDescription } from "@purosur/ui/formatters";
import { type Cell, cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";
import { stockQuantityCells } from "./stock-quantity-cells";
import { REPORTED_LOSS_REASON_LABELS } from "./stock-reason-labels";

export function lossesByReasonReportSpreadsheet(shown: LossesByReasonReportBody): Workbook {
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        [
          "Pérdidas",
          cell.count(shown.reasons.reduce((sum, { loss_count }) => sum + loss_count, 0)),
        ],
        ["Motivos", cell.count(shown.reasons.length)],
        ...shown.reasons.map(
          ({ reason, loss_count }) =>
            [`${REPORTED_LOSS_REASON_LABELS[reason]} (pérdidas)`, cell.count(loss_count)] as const,
        ),
      ]),
      ...shown.reasons.map((losses) => ({
        name: REPORTED_LOSS_REASON_LABELS[losses.reason],
        header: ["Producto", "Cantidad (u)", "Cantidad (kg)", "Pérdidas"],
        rows: losses.products.map((product): Cell[] => [
          cell.text(
            formatProductDescription({
              name: product.name,
              brandName: product.brand_name,
              netContent: product.net_content,
            }),
          ),
          ...stockQuantityCells(product.quantity, product.sale_unit),
          cell.count(product.loss_count),
        ]),
      })),
    ],
  };
}
