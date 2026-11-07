import type { CashSessionClosesBody } from "@purosur/contracts";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";
import { CLOSED_TIME_ZONE } from "./cash-session-closes-closed-time-zone";
import { cashiersWithDifferenceText, UNIDENTIFIED } from "./cash-session-closes-text";

type SessionRow = CashSessionClosesBody["sessions"][number];

function closedByCell(session: SessionRow) {
  return session.closed_by_id === session.cashier_id
    ? cell.empty()
    : cell.text(session.closed_by_name ?? UNIDENTIFIED);
}

function differenceCell(session: SessionRow) {
  return session.has_difference ? cell.money(session.difference) : cell.money(0);
}

export function cashSessionClosesSpreadsheet(
  shown: CashSessionClosesBody,
  rows: readonly SessionRow[],
  registerLabel: string,
): Workbook {
  const cashiersWithDifference = cashiersWithDifferenceText(shown.totals);
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Caja", cell.text(registerLabel)],
        ["Sesiones cerradas", cell.count(shown.totals.sessions)],
        ["Diferencia total", cell.money(shown.totals.net_difference)],
        ["Con diferencia", cell.count(shown.totals.with_difference)],
        [
          "Cajeros con diferencia",
          cashiersWithDifference === undefined ? cell.empty() : cell.text(cashiersWithDifference),
        ],
      ]),
      {
        name: "Cierres de caja",
        header: ["Fecha", "Caja", "Cajero", "Cerró", "Esperado", "Contado", "Diferencia"],
        rows: rows.map((session) => [
          cell.instant(session.closed_at, CLOSED_TIME_ZONE),
          cell.text(session.register_name),
          cell.text(session.cashier_name ?? UNIDENTIFIED),
          closedByCell(session),
          cell.money(session.expected_cash),
          cell.money(session.counted_cash),
          differenceCell(session),
        ]),
      },
    ],
  };
}
