import type { HandTypedWeightsBody } from "@purosur/contracts";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";
import { OPENED_TIME_ZONE } from "./hand-typed-weights-opened-time-zone";

const UNIDENTIFIED = "Sin identificar";

export function handTypedWeightsSpreadsheet(
  shown: HandTypedWeightsBody,
  registerLabel: string,
): Workbook {
  const mostTyped = shown.totals.most_typed;
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Caja", cell.text(registerLabel)],
        ["Líneas pesadas", cell.count(shown.totals.weighed_lines)],
        ["Tipeadas a mano", cell.count(shown.totals.typed_lines)],
        [
          "Más tipeó",
          mostTyped === null ? cell.empty() : cell.text(mostTyped.name ?? UNIDENTIFIED),
        ],
      ]),
      {
        name: "Por cajero",
        header: ["Cajero", "Pesadas", "Tipeadas a mano"],
        rows: shown.cashiers.map((row) => [
          cell.text(row.name ?? UNIDENTIFIED),
          cell.count(row.weighed_lines),
          cell.count(row.typed_lines),
        ]),
      },
      {
        name: "Por sesión",
        header: ["Caja", "Apertura", "Pesadas", "Tipeadas a mano"],
        rows: shown.sessions.map((row) => [
          cell.text(row.register_name),
          cell.instant(row.opened_at, OPENED_TIME_ZONE),
          cell.count(row.weighed_lines),
          cell.count(row.typed_lines),
        ]),
      },
    ],
  };
}
