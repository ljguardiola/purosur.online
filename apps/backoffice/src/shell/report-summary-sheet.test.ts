import { cell } from "../platform/spreadsheet/workbook";
import { expect, test } from "vitest";
import { periodSummaryRows, summarySheet } from "./report-summary-sheet";

test("is the Resumen sheet, one row per label with its typed value", () => {
  expect(
    summarySheet([
      ["Caja", cell.text("Todas")],
      ["Total vendido", cell.money(1_348_050)],
    ]),
  ).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Caja"), cell.text("Todas")],
      [cell.text("Total vendido"), cell.money(1_348_050)],
    ],
  });
});

test("lists the answered period as Desde and Hasta days", () => {
  expect(periodSummaryRows({ from: "2026-10-01", to: "2026-10-07" })).toEqual([
    ["Desde", cell.day("2026-10-01")],
    ["Hasta", cell.day("2026-10-07")],
  ]);
});
