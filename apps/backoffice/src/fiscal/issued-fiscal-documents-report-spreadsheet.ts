import type { IssuedFiscalDocumentsReportBody } from "@purosur/contracts";
import { formatPointOfSaleNumber } from "@purosur/ui";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";
import { voucherTypeText } from "./issued-fiscal-document-text";

type ReportRow = IssuedFiscalDocumentsReportBody["rows"][number];

const TENTHS_PER_PERCENT = 10;

export function issuedFiscalDocumentsReportSpreadsheet(
  shown: IssuedFiscalDocumentsReportBody,
  rows: readonly ReportRow[],
  registerLabel: string,
): Workbook {
  const { totals } = shown;
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Caja", cell.text(registerLabel)],
        ["Facturas", cell.money(totals.receipts.amount)],
        ["Cantidad de facturas", cell.count(totals.receipts.count)],
        ["Notas de crédito", cell.money(totals.credit_notes.amount)],
        ["Cantidad de notas de crédito", cell.count(totals.credit_notes.count)],
        ["Total neto", cell.money(totals.amount)],
        ["Emitidos con CAEA", cell.count(totals.contingency.count)],
        [
          "Parte emitida con CAEA",
          totals.contingency.share_tenths_of_percent === null
            ? cell.empty()
            : cell.percent(totals.contingency.share_tenths_of_percent / TENTHS_PER_PERCENT),
        ],
      ]),
      {
        name: "Comprobantes emitidos",
        header: ["Comprobante", "Punto de venta", "Autorización", "Cantidad", "Importe"],
        rows: rows.map((row) => [
          cell.text(voucherTypeText(row.voucher_type)),
          cell.text(formatPointOfSaleNumber(row.point_of_sale)),
          cell.text(row.authorization_kind === "cae" ? "CAE" : "CAEA"),
          cell.count(row.count),
          cell.money(row.amount),
        ]),
      },
    ],
  };
}
