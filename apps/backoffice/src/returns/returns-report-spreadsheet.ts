import type { ReturnsReportBody } from "@purosur/contracts";
import { type Cell, cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";
import { OCCURRED_TIME_ZONE } from "./returns-report-occurred-time-zone";
import {
  returnLineDispositionText,
  returnLineReasonText,
  returnSaleText,
  UNIDENTIFIED,
} from "./returns-text";

type ReturnRow = ReturnsReportBody["typed"]["rows"][number];
type ReturnLine = ReturnRow["lines"][number];

const NO_LINE_CELLS: Cell[] = [
  cell.empty(),
  cell.empty(),
  cell.empty(),
  cell.empty(),
  cell.empty(),
];

function lineCells(line: ReturnLine): Cell[] {
  return [
    cell.text(line.product_name),
    line.sale_unit === "KG" ? cell.empty() : cell.count(line.quantity),
    line.sale_unit === "KG" ? cell.weight(line.quantity) : cell.empty(),
    cell.text(returnLineReasonText(line.reason)),
    cell.text(returnLineDispositionText(line.disposition)),
  ];
}

function returnRows(row: ReturnRow): Cell[][] {
  const { operation, invoice } = returnSaleText(row.sale);
  const lines = row.lines.length === 0 ? [NO_LINE_CELLS] : row.lines.map(lineCells);
  return lines.map((line) => [
    cell.instant(row.occurred_at, OCCURRED_TIME_ZONE),
    cell.text(row.register.name),
    operation === null ? cell.empty() : cell.text(operation),
    invoice === null ? cell.empty() : cell.text(invoice),
    cell.text(row.cashier.name ?? UNIDENTIFIED),
    row.authorizer === null ? cell.empty() : cell.text(row.authorizer.name ?? UNIDENTIFIED),
    ...line,
    cell.money(row.refunded),
  ]);
}

const HEADER = [
  "Fecha",
  "Caja",
  "Venta",
  "Comprobante",
  "Cajero",
  "Autorizó",
  "Producto",
  "Cantidad (u)",
  "Cantidad (kg)",
  "Motivo",
  "Destino",
  "Reintegrado",
];

export function returnsReportSpreadsheet(
  shown: ReturnsReportBody,
  registerLabel: string,
): Workbook {
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Caja", cell.text(registerLabel)],
        ["Devoluciones", cell.count(shown.typed.totals.returns + shown.scanned.totals.returns)],
        ["Reintegrado", cell.money(shown.typed.totals.refunded + shown.scanned.totals.refunded)],
        ["Iniciadas a mano", cell.count(shown.typed.totals.returns)],
      ]),
      {
        name: "Iniciadas con el número tipeado",
        header: HEADER,
        rows: shown.typed.rows.flatMap(returnRows),
      },
      {
        name: "Iniciadas escaneando el QR",
        header: HEADER,
        rows: shown.scanned.rows.flatMap(returnRows),
      },
    ],
  };
}
