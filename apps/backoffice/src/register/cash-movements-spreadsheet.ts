import type { CashMovementsBody } from "@purosur/contracts";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";
import { KIND_LABELS } from "./cash-movements-kind-labels";
import { OCCURRED_TIME_ZONE, OPENED_TIME_ZONE } from "./cash-movements-time-zones";
import { TOTAL_CARDS } from "./cash-movements-total-cards";

type MovementRow = CashMovementsBody["movements"][number];

export function cashMovementsSpreadsheet(
  shown: CashMovementsBody,
  rows: readonly MovementRow[],
  registerLabel: string,
): Workbook {
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Caja", cell.text(registerLabel)],
        ...TOTAL_CARDS.flatMap(({ label, movementsLabel, totalOf }) => [
          [label, cell.money(totalOf(shown.totals).amount)] as const,
          [movementsLabel, cell.count(totalOf(shown.totals).movements)] as const,
        ]),
      ]),
      {
        name: "Movimientos de efectivo",
        header: ["Fecha", "Tipo", "Motivo", "Sesión", "Apertura", "Monto"],
        rows: rows.map((movement) => [
          cell.instant(movement.occurred_at, OCCURRED_TIME_ZONE),
          cell.text(KIND_LABELS[movement.kind]),
          cell.text(movement.reason),
          cell.text(movement.register_name),
          cell.instant(movement.session_opened_at, OPENED_TIME_ZONE),
          cell.money(movement.amount),
        ]),
      },
    ],
  };
}
