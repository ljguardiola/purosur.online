import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { CLOSED_TIME_ZONE } from "./cash-session-closes-closed-time-zone";
import { cashSessionClosesSpreadsheet } from "./cash-session-closes-spreadsheet";
import {
  emptyCashSessionClosesReport,
  weekCashSessionClosesReport,
} from "./test-support/cash-session-closes-fixtures";

test("has a Resumen sheet with the period, the register and the figures the screen shows", () => {
  const [summary] = cashSessionClosesSpreadsheet(
    weekCashSessionClosesReport,
    weekCashSessionClosesReport.sessions,
    "Caja del fondo",
  ).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-01")],
      [cell.text("Hasta"), cell.day("2026-10-07")],
      [cell.text("Caja"), cell.text("Caja del fondo")],
      [cell.text("Sesiones cerradas"), cell.count(3)],
      [cell.text("Diferencia total"), cell.money(-42_000)],
      [cell.text("Con diferencia"), cell.count(2)],
      [cell.text("Cajeros con diferencia"), cell.text("Tomás Ruiz 1 · Lucía Pérez 1")],
    ],
  });
});

test("leaves the cashiers with a difference empty when no session had one", () => {
  const [summary] = cashSessionClosesSpreadsheet(emptyCashSessionClosesReport, [], "Todas").sheets;

  expect(summary?.rows.slice(-2)).toEqual([
    [cell.text("Con diferencia"), cell.count(0)],
    [cell.text("Cajeros con diferencia"), cell.empty()],
  ]);
});

test("has a sheet named after the table with each close, naming who closed only when it was not the cashier", () => {
  const sheets = cashSessionClosesSpreadsheet(
    weekCashSessionClosesReport,
    weekCashSessionClosesReport.sessions,
    "Todas",
  ).sheets;

  expect(sheets[1]).toEqual({
    name: "Cierres de sesión",
    header: ["Fecha", "Caja", "Cajero", "Cerró", "Esperado", "Contado", "Diferencia"],
    rows: [
      [
        cell.instant("2026-10-06T20:00:00.000Z", CLOSED_TIME_ZONE),
        cell.text("Caja principal"),
        cell.text("Tomás Ruiz"),
        cell.empty(),
        cell.money(100_000),
        cell.money(50_000),
        cell.money(-50_000),
      ],
      [
        cell.instant("2026-10-06T14:30:00.000Z", CLOSED_TIME_ZONE),
        cell.text("Caja del fondo"),
        cell.text("Lucía Pérez"),
        cell.empty(),
        cell.money(80_000),
        cell.money(88_000),
        cell.money(8_000),
      ],
      [
        cell.instant("2026-10-05T21:15:00.000Z", CLOSED_TIME_ZONE),
        cell.text("Caja principal"),
        cell.text("Ana"),
        cell.text("Beto"),
        cell.money(60_000),
        cell.money(60_000),
        cell.money(0),
      ],
    ],
  });
});
