import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { averageTicketSpreadsheet } from "./average-ticket-spreadsheet";
import {
  averageTicketReport,
  noPreviousAverageTicketReport,
  noSalesAverageTicketReport,
  quietWeekAverageTicketReport,
} from "./test-support/sales-fixtures";

test("has a Resumen sheet with the period, the register and the three figures the screen shows", () => {
  const [summary] = averageTicketSpreadsheet(
    averageTicketReport,
    averageTicketReport.weeks,
    "Caja del fondo",
  ).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-09-24")],
      [cell.text("Hasta"), cell.day("2026-10-14")],
      [cell.text("Caja"), cell.text("Caja del fondo")],
      [cell.text("Ticket promedio"), cell.money(25_000)],
      [cell.text("Ventas"), cell.count(70)],
      [cell.text("Período anterior"), cell.money(24_000)],
      [cell.text("Fechas del período anterior"), cell.text("Del 03/09/2026 al 23/09/2026")],
      [cell.text("Diferencia"), cell.percent(4.2)],
    ],
  });
});

test("leaves the previous period and the difference empty when there is none", () => {
  const [summary] = averageTicketSpreadsheet(noPreviousAverageTicketReport, [], "Todas").sheets;

  expect(summary?.rows.slice(-3)).toEqual([
    [cell.text("Período anterior"), cell.empty()],
    [cell.text("Fechas del período anterior"), cell.empty()],
    [cell.text("Diferencia"), cell.empty()],
  ]);
});

test("leaves the average ticket empty when there are no sales", () => {
  const [summary] = averageTicketSpreadsheet(noSalesAverageTicketReport, [], "Todas").sheets;

  expect(summary?.rows[3]).toEqual([cell.text("Ticket promedio"), cell.empty()]);
});

test("has a sheet named after the table with each week in the given order", () => {
  const sheets = averageTicketSpreadsheet(
    quietWeekAverageTicketReport,
    [...quietWeekAverageTicketReport.weeks].reverse(),
    "Todas",
  ).sheets;

  expect(sheets[1]).toEqual({
    name: "Ticket promedio por semana",
    header: ["Semana", "Ventas", "Importe", "Ticket promedio"],
    rows: [
      [cell.text("Del 24/09/2026 al 30/09/2026"), cell.count(0), cell.money(0), cell.empty()],
      [
        cell.text("Del 01/10/2026 al 07/10/2026"),
        cell.count(10),
        cell.money(500_000),
        cell.money(50_000),
      ],
      [
        cell.text("Del 08/10/2026 al 14/10/2026"),
        cell.count(40),
        cell.money(1_100_000),
        cell.money(27_500),
      ],
    ],
  });
});
