import { type Cell, cell, type Sheet } from "../platform/spreadsheet/workbook";

export type SummaryRow = readonly [label: string, value: Cell];

export function summarySheet(rows: SummaryRow[]): Sheet {
  return {
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: rows.map(([label, value]) => [cell.text(label), value]),
  };
}

export function periodSummaryRows(period: { from: string; to: string }): SummaryRow[] {
  return [
    ["Desde", cell.day(period.from)],
    ["Hasta", cell.day(period.to)],
  ];
}
