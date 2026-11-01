import type { RemovedLinesAndCancelledSalesBody } from "@purosur/contracts";
import { type Cell, cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";
import { OPENED_TIME_ZONE } from "./removed-lines-and-cancelled-sales-opened-time-zone";

type FigureRow = Pick<
  RemovedLinesAndCancelledSalesBody["cashiers"][number],
  "removed" | "cancelled"
>;

const UNIDENTIFIED = "Sin identificar";

const FIGURE_HEADER = [
  "Líneas quitadas",
  "Cantidad quitada (u)",
  "Cantidad quitada (kg)",
  "Importe quitado",
  "Ventas canceladas",
  "Cantidad cancelada (u)",
  "Cantidad cancelada (kg)",
  "Importe cancelado",
];

function figureCells({ removed, cancelled }: FigureRow): Cell[] {
  return [
    cell.count(removed.lines),
    cell.count(removed.units),
    cell.weight(removed.thousandths),
    cell.money(removed.amount),
    cell.count(cancelled.sales),
    cell.count(cancelled.units),
    cell.weight(cancelled.thousandths),
    cell.money(cancelled.amount),
  ];
}

export function removedLinesAndCancelledSalesSpreadsheet(
  shown: RemovedLinesAndCancelledSalesBody,
  registerLabel: string,
): Workbook {
  const { removed, cancelled } = shown.totals;
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Caja", cell.text(registerLabel)],
        ["Líneas quitadas", cell.count(removed.lines)],
        ["Cantidad quitada (u)", cell.count(removed.units)],
        ["Cantidad quitada (kg)", cell.weight(removed.thousandths)],
        ["Importe quitado", cell.money(removed.amount)],
        ["Ventas canceladas", cell.count(cancelled.sales)],
        ["Cantidad cancelada (u)", cell.count(cancelled.units)],
        ["Cantidad cancelada (kg)", cell.weight(cancelled.thousandths)],
        ["Importe cancelado", cell.money(cancelled.amount)],
      ]),
      {
        name: "Por cajero",
        header: ["Cajero", ...FIGURE_HEADER],
        rows: shown.cashiers.map((row) => [
          cell.text(row.name ?? UNIDENTIFIED),
          ...figureCells(row),
        ]),
      },
      {
        name: "Por sesión",
        header: ["Caja", "Apertura", ...FIGURE_HEADER],
        rows: shown.sessions.map((row) => [
          cell.text(row.register_name),
          cell.instant(row.opened_at, OPENED_TIME_ZONE),
          ...figureCells(row),
        ]),
      },
    ],
  };
}
