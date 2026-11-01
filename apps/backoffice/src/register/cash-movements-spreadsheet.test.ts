import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { cashMovementsSpreadsheet } from "./cash-movements-spreadsheet";
import { OCCURRED_TIME_ZONE, OPENED_TIME_ZONE } from "./cash-movements-time-zones";
import {
  emptyCashMovementsReport,
  weekCashMovementsReport,
} from "./test-support/cash-movements-fixtures";

test("has a Resumen sheet with the period, the register and the totals of each kind", () => {
  const [summary] = cashMovementsSpreadsheet(
    weekCashMovementsReport,
    weekCashMovementsReport.movements,
    "Caja del fondo",
  ).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-01")],
      [cell.text("Hasta"), cell.day("2026-10-07")],
      [cell.text("Caja"), cell.text("Caja del fondo")],
      [cell.text("Ingresos"), cell.money(20_000)],
      [cell.text("Movimientos de ingresos"), cell.count(1)],
      [cell.text("Gastos"), cell.money(15_550)],
      [cell.text("Movimientos de gastos"), cell.count(2)],
      [cell.text("Retiros"), cell.money(50_000)],
      [cell.text("Movimientos de retiros"), cell.count(1)],
    ],
  });
});

test("has a sheet named after the table with each movement in the given order", () => {
  const sheets = cashMovementsSpreadsheet(
    weekCashMovementsReport,
    [...weekCashMovementsReport.movements].reverse().slice(0, 2),
    "Todas",
  ).sheets;

  expect(sheets[1]).toEqual({
    name: "Movimientos de caja",
    header: ["Fecha", "Tipo", "Motivo", "Sesión", "Apertura", "Monto"],
    rows: [
      [
        cell.instant("2026-10-05T15:00:00.000Z", OCCURRED_TIME_ZONE),
        cell.text("Gasto"),
        cell.text("Bolsas de papel"),
        cell.text("Caja principal"),
        cell.instant("2026-10-05T11:00:00.000Z", OPENED_TIME_ZONE),
        cell.money(3_000),
      ],
      [
        cell.instant("2026-10-05T21:15:00.000Z", OCCURRED_TIME_ZONE),
        cell.text("Ingreso"),
        cell.text("Cambio para la caja"),
        cell.text("Caja principal"),
        cell.instant("2026-10-05T11:00:00.000Z", OPENED_TIME_ZONE),
        cell.money(20_000),
      ],
    ],
  });
});

test("writes zero totals and a table without rows when there are no movements", () => {
  const sheets = cashMovementsSpreadsheet(emptyCashMovementsReport, [], "Todas").sheets;

  expect(sheets[0]?.rows.slice(-2)).toEqual([
    [cell.text("Retiros"), cell.money(0)],
    [cell.text("Movimientos de retiros"), cell.count(0)],
  ]);
  expect(sheets[1]?.rows).toEqual([]);
});
