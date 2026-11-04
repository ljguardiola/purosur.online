import { type PendingPurchaseOrdersBody, pendingPurchaseOrdersSchema } from "@purosur/contracts";
import { schemaText } from "../platform/schema-text";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";
import { purchaseOrderStatusOf } from "./purchase-order-status";

const SENT_AT_TIME_ZONE = schemaText(
  pendingPurchaseOrdersSchema.shape.orders.element.shape.sent_at.meta()?.["timeZone"],
);

const yesOrNo = (value: boolean) => cell.text(value ? "Sí" : "No");

export function pendingPurchaseOrdersReportSpreadsheet(shown: PendingPurchaseOrdersBody): Workbook {
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Pedidos pendientes", cell.count(shown.totals.orders)],
        ["Proveedores", cell.count(shown.totals.suppliers)],
        ["Importe esperado", cell.money(shown.totals.expected_total_cents)],
        ["Hay líneas sin precio de lista", yesOrNo(shown.totals.has_unpriced_line)],
      ]),
      {
        name: "Pedidos pendientes de recibir",
        header: [
          "Proveedor",
          "Enviado el",
          "Estado",
          "Productos",
          "Importe esperado",
          "Hay líneas sin precio de lista",
        ],
        rows: shown.orders.map((order) => [
          cell.text(order.supplier.name),
          cell.instant(order.sent_at, SENT_AT_TIME_ZONE),
          cell.text(purchaseOrderStatusOf(order.state).label),
          cell.count(order.line_count),
          cell.money(order.expected_total_cents),
          yesOrNo(order.has_unpriced_line),
        ]),
      },
    ],
  };
}
