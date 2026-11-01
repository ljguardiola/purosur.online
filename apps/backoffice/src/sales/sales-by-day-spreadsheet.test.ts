import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { salesByDaySpreadsheet } from "./sales-by-day-spreadsheet";
import { todayReport, weekReport } from "./test-support/sales-fixtures";

test("has a Resumen sheet with the answered period, the register and the totals the screen shows", () => {
  const [summary] = salesByDaySpreadsheet(weekReport, "Caja del fondo").sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-01")],
      [cell.text("Hasta"), cell.day("2026-10-07")],
      [cell.text("Caja"), cell.text("Caja del fondo")],
      [cell.text("Total vendido"), cell.money(1_348_050)],
      [cell.text("Cantidad de ventas"), cell.count(4)],
    ],
  });
});

test("has a sheet named after the table with each day's sales count and total in the screen's order", () => {
  const sheets = salesByDaySpreadsheet(weekReport, "Todas").sheets;

  expect(sheets[1]).toEqual({
    name: "Ventas por día",
    header: ["Día", "Ventas", "Total"],
    rows: [
      [cell.day("2026-10-02"), cell.count(3), cell.money(1_250_050)],
      [cell.day("2026-10-05"), cell.count(1), cell.money(98_000)],
    ],
  });
});

test("has the days sheet with its header only when there are no days", () => {
  expect(salesByDaySpreadsheet(todayReport, "Todas").sheets[1]?.rows).toEqual([]);
});
