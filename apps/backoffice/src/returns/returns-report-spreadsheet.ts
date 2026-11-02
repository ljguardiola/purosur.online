import type { ReturnsReportBody } from "@purosur/contracts";
import { type Cell, cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";
import {
  authorizerSummaryRows,
  cashierSummaryRows,
  type PersonSummaryRow,
} from "./returns-person-summary";
import { OCCURRED_TIME_ZONE } from "./returns-report-occurred-time-zone";
import {
  returnLineDispositionText,
  returnLineReasonText,
  returnLineResolutionText,
  returnSaleText,
  UNIDENTIFIED,
} from "./returns-text";

type ReturnRow = ReturnsReportBody["typed"]["rows"][number];
type ReturnLine = ReturnRow["lines"][number];
type VoidRow = ReturnsReportBody["voids"]["rows"][number];

const NO_LINE_CELLS: Cell[] = [
  cell.empty(),
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
    cell.text(returnLineResolutionText(line.resolution)),
  ];
}

function returnRows(row: ReturnRow): Cell[][] {
  const { operation, invoice } = returnSaleText(row.sale);
  const lines = row.lines.length === 0 ? [NO_LINE_CELLS] : row.lines.map(lineCells);
  return lines.map((line, index) => [
    cell.instant(row.occurred_at, OCCURRED_TIME_ZONE),
    cell.text(row.register.name),
    operation === null ? cell.empty() : cell.text(operation),
    invoice === null ? cell.empty() : cell.text(invoice),
    cell.text(row.cashier.name ?? UNIDENTIFIED),
    row.authorizer === null ? cell.empty() : cell.text(row.authorizer.name ?? UNIDENTIFIED),
    ...line,
    index === 0 ? cell.money(row.refunded) : cell.empty(),
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
  "Resolución",
  "Reintegrado",
];

const VOID_HEADER = ["Fecha", "Caja", "Venta", "Comprobante", "Cajero", "Autorizó", "Total"];

const PERSON_HEADER = [
  "Anulaciones",
  "Anulado",
  "Devoluciones",
  "Reintegrado",
  "Líneas reintegradas",
  "Líneas cambiadas",
  "Iniciadas a mano",
];

function voidRow(row: VoidRow): Cell[] {
  const { operation, invoice } = returnSaleText(row.sale);
  return [
    cell.instant(row.voided_at, OCCURRED_TIME_ZONE),
    cell.text(row.register.name),
    operation === null ? cell.empty() : cell.text(operation),
    invoice === null ? cell.empty() : cell.text(invoice),
    cell.text(row.cashier.name ?? UNIDENTIFIED),
    row.authorizer === null ? cell.empty() : cell.text(row.authorizer.name ?? UNIDENTIFIED),
    cell.money(row.total),
  ];
}

function personRow(row: PersonSummaryRow): Cell[] {
  return [
    cell.text(row.label),
    cell.count(row.voids),
    cell.money(row.voided),
    cell.count(row.returns),
    cell.money(row.refunded),
    cell.count(row.refunded_lines),
    cell.count(row.exchanged_lines),
    cell.count(row.typed_returns),
  ];
}

export function returnsReportSpreadsheet(
  shown: ReturnsReportBody,
  registerLabel: string,
): Workbook {
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Caja", cell.text(registerLabel)],
        ["Anulaciones", cell.count(shown.totals.voids)],
        ["Anulado", cell.money(shown.totals.voided)],
        ["Devoluciones", cell.count(shown.totals.returns)],
        ["Reintegrado", cell.money(shown.totals.refunded)],
        ["Cambios", cell.count(shown.totals.exchanged_lines)],
        ["Iniciadas a mano", cell.count(shown.totals.typed_returns)],
      ]),
      { name: "Anulaciones", header: VOID_HEADER, rows: shown.voids.rows.map(voidRow) },
      {
        name: "Por cajero",
        header: ["Cajero", ...PERSON_HEADER],
        rows: cashierSummaryRows(shown).map(personRow),
      },
      {
        name: "Por quién autorizó",
        header: ["Autorizó", ...PERSON_HEADER],
        rows: authorizerSummaryRows(shown).map(personRow),
      },
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
