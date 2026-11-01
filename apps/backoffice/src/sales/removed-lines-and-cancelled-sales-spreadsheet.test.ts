import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { removedLinesAndCancelledSalesSpreadsheet } from "./removed-lines-and-cancelled-sales-spreadsheet";
import {
  nothingRemovedOrCancelledReport,
  removedLinesAndCancelledSalesReport,
} from "./test-support/removed-lines-and-cancelled-sales-fixtures";

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

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

test("has a Resumen sheet with the period, the register and the figures the screen shows", () => {
  const [summary] = removedLinesAndCancelledSalesSpreadsheet(
    removedLinesAndCancelledSalesReport,
    "Caja del fondo",
  ).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-01")],
      [cell.text("Hasta"), cell.day("2026-10-07")],
      [cell.text("Caja"), cell.text("Caja del fondo")],
      [cell.text("Líneas quitadas"), cell.count(5)],
      [cell.text("Cantidad quitada (u)"), cell.count(7)],
      [cell.text("Cantidad quitada (kg)"), cell.weight(1_750)],
      [cell.text("Importe quitado"), cell.money(1_590_000)],
      [cell.text("Ventas canceladas"), cell.count(3)],
      [cell.text("Cantidad cancelada (u)"), cell.count(8)],
      [cell.text("Cantidad cancelada (kg)"), cell.weight(2_000)],
      [cell.text("Importe cancelado"), cell.money(1_230_050)],
    ],
  });
});

test("has a sheet Por cajero with the removed and cancelled figures of each cashier", () => {
  const sheets = removedLinesAndCancelledSalesSpreadsheet(
    removedLinesAndCancelledSalesReport,
    "Todas",
  ).sheets;

  expect(sheets[1]?.name).toBe("Por cajero");
  expect(sheets[1]?.header).toEqual(["Cajero", ...FIGURE_HEADER]);
  expect(sheets[1]?.rows[0]).toEqual([
    cell.text("Beto"),
    cell.count(4),
    cell.count(7),
    cell.weight(1_250),
    cell.money(1_500_000),
    cell.count(2),
    cell.count(5),
    cell.weight(0),
    cell.money(820_050),
  ]);
  expect(sheets[1]?.rows[1]?.[0]).toEqual(cell.text("Sin identificar"));
  expect(sheets[1]?.rows).toHaveLength(3);
});

test("has a sheet Por sesión with the register, the opening instant and the figures of each session", () => {
  const sheets = removedLinesAndCancelledSalesSpreadsheet(
    removedLinesAndCancelledSalesReport,
    "Todas",
  ).sheets;

  expect(sheets[2]?.name).toBe("Por sesión");
  expect(sheets[2]?.header).toEqual(["Caja", "Apertura", ...FIGURE_HEADER]);
  expect(sheets[2]?.rows[1]).toEqual([
    cell.text("Caja del fondo"),
    cell.instant("2026-10-05T21:05:00.000Z", ARGENTINA_TIME_ZONE),
    cell.count(2),
    cell.count(1),
    cell.weight(1_750),
    cell.money(490_000),
    cell.count(1),
    cell.count(3),
    cell.weight(2_000),
    cell.money(410_000),
  ]);
});

test("has both tables without rows when nothing was removed or cancelled", () => {
  const sheets = removedLinesAndCancelledSalesSpreadsheet(
    nothingRemovedOrCancelledReport,
    "Todas",
  ).sheets;

  expect(sheets[1]?.rows).toEqual([]);
  expect(sheets[2]?.rows).toEqual([]);
});
