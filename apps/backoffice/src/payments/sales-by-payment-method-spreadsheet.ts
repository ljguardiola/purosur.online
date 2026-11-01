import type { SalesByPaymentMethodBody } from "@purosur/contracts";
import { paymentMethodLabel } from "../platform/payment-method-label";
import { shareOfTotal } from "../platform/share-of-total";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";

type SalesOfMethod = SalesByPaymentMethodBody["methods"][number];

export function salesByPaymentMethodSpreadsheet(
  shown: SalesByPaymentMethodBody,
  rows: readonly SalesOfMethod[],
  registerLabel: string,
): Workbook {
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Caja", cell.text(registerLabel)],
        ["Total vendido", cell.money(shown.totals.total)],
        ["Ventas", cell.count(shown.totals.sales_count)],
        [
          "Ticket promedio",
          shown.totals.average_ticket === null
            ? cell.empty()
            : cell.money(shown.totals.average_ticket),
        ],
      ]),
      {
        name: "Ventas por medio de pago",
        header: ["Medio de pago", "Ventas", "Importe", "Parte del total"],
        rows: rows.map((sales) => [
          cell.text(paymentMethodLabel(sales.method)),
          cell.count(sales.sales_count),
          cell.money(sales.amount),
          cell.percent(shareOfTotal(sales.amount, shown.totals.total) * 100),
        ]),
      },
    ],
  };
}
