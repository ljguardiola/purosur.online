import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { cashRoundingSpreadsheet } from "./cash-rounding-spreadsheet";
import { cashRoundingReport, noCashRoundingReport } from "./test-support/sales-fixtures";

test("has a Resumen sheet with the answered period, the register and the totals the screen shows", () => {
  const [summary] = cashRoundingSpreadsheet(cashRoundingReport, "Caja del fondo").sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-01")],
      [cell.text("Hasta"), cell.day("2026-10-07")],
      [cell.text("Caja"), cell.text("Caja del fondo")],
      [cell.text("Redondeo"), cell.money(22_050)],
      [cell.text("Ventas redondeadas"), cell.count(4)],
    ],
  });
});

test("has a sheet named after the table with each day and register in the screen's order", () => {
  const sheets = cashRoundingSpreadsheet(cashRoundingReport, "Todas").sheets;

  expect(sheets[1]).toEqual({
    name: "Redondeo en efectivo",
    header: ["Día", "Caja", "Redondeo", "Ventas redondeadas"],
    rows: [
      [cell.day("2026-10-02"), cell.text("Caja del fondo"), cell.money(7_050), cell.count(1)],
      [cell.day("2026-10-02"), cell.text("Caja principal"), cell.money(15_000), cell.count(3)],
    ],
  });
});

test("has the rows sheet with its header only when there is no rounding", () => {
  expect(cashRoundingSpreadsheet(noCashRoundingReport, "Todas").sheets[1]?.rows).toEqual([]);
});
