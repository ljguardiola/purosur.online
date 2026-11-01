import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { salesByCashierSpreadsheet } from "./sales-by-cashier-spreadsheet";
import { cashierSalesReport, noCashierSalesReport } from "./test-support/sales-fixtures";

test("has a Resumen sheet with the period, the register and the figures the screen shows", () => {
  const [summary] = salesByCashierSpreadsheet(
    cashierSalesReport,
    cashierSalesReport.rows,
    "Caja del fondo",
  ).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-01")],
      [cell.text("Hasta"), cell.day("2026-10-07")],
      [cell.text("Caja"), cell.text("Caja del fondo")],
      [cell.text("Cajeros con ventas"), cell.count(3)],
      [cell.text("Más ventas"), cell.text("Ana")],
      [cell.text("Ticket promedio"), cell.money(25_000)],
    ],
  });
});

test("has a sheet named after the table with each cashier's figures in the given order", () => {
  const sheets = salesByCashierSpreadsheet(
    cashierSalesReport,
    [...cashierSalesReport.rows].reverse(),
    "Todas",
  ).sheets;

  expect(sheets[1]).toEqual({
    name: "Ventas por cajero",
    header: ["Cajero", "Sesiones", "Ventas", "Importe", "Ticket promedio"],
    rows: [
      [cell.text("Sin identificar"), cell.count(2), cell.count(5), cell.money(75_000), cell.money(15_000)],
      [cell.text("Beto"), cell.count(4), cell.count(25), cell.money(875_000), cell.money(35_000)],
      [cell.text("Ana"), cell.count(1), cell.count(40), cell.money(800_000), cell.money(20_000)],
    ],
  });
});

test("leaves the figures without a value empty and the table without rows when there are no sales", () => {
  const sheets = salesByCashierSpreadsheet(noCashierSalesReport, [], "Todas").sheets;

  expect(sheets[0]?.rows.slice(-2)).toEqual([
    [cell.text("Más ventas"), cell.empty()],
    [cell.text("Ticket promedio"), cell.empty()],
  ]);
  expect(sheets[1]?.rows).toEqual([]);
});
