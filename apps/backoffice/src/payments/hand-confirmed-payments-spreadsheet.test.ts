import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { CONFIRMED_TIME_ZONE } from "./hand-confirmed-payments-confirmed-time-zone";
import { handConfirmedPaymentsSpreadsheet } from "./hand-confirmed-payments-spreadsheet";
import {
  emptyHandConfirmedReport,
  weekHandConfirmedReport,
} from "./test-support/payments-report-fixtures";

test("has a Resumen sheet with the period, the register, the method and the figures the screen shows", () => {
  const [summary] = handConfirmedPaymentsSpreadsheet(
    weekHandConfirmedReport,
    "TRANSFER",
    "Caja del fondo",
    weekHandConfirmedReport,
  ).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-01")],
      [cell.text("Hasta"), cell.day("2026-10-07")],
      [cell.text("Caja"), cell.text("Caja del fondo")],
      [cell.text("Medio"), cell.text("Transferencia")],
      [cell.text("Pagos"), cell.count(3)],
      [cell.text("Importe de pagos"), cell.money(190_000)],
      [cell.text("Transferencias"), cell.count(2)],
      [cell.text("Importe de transferencias"), cell.money(150_000)],
      [cell.text("Terminal independiente"), cell.count(1)],
      [cell.text("Importe de terminal independiente"), cell.money(40_000)],
    ],
  });
});

test("shows every method as Todos and zero for a method with no payments", () => {
  const [summary] = handConfirmedPaymentsSpreadsheet(
    emptyHandConfirmedReport,
    "ALL",
    "Todas",
    emptyHandConfirmedReport,
  ).sheets;

  expect(summary?.rows).toContainEqual([cell.text("Medio"), cell.text("Todos")]);
  expect(summary?.rows.slice(-4)).toEqual([
    [cell.text("Transferencias"), cell.count(0)],
    [cell.text("Importe de transferencias"), cell.money(0)],
    [cell.text("Terminal independiente"), cell.count(0)],
    [cell.text("Importe de terminal independiente"), cell.money(0)],
  ]);
});

test("has a sheet by cashier with each method's count and amount in its own columns", () => {
  const sheets = handConfirmedPaymentsSpreadsheet(
    weekHandConfirmedReport,
    "ALL",
    "Todas",
    weekHandConfirmedReport,
  ).sheets;

  expect(sheets[1]).toEqual({
    name: "Por cajero",
    header: [
      "Cajero",
      "Transferencias",
      "Importe de transferencias",
      "Terminal independiente",
      "Importe de terminal independiente",
      "Pagos",
      "Importe",
    ],
    rows: [
      [
        cell.text("Ana"),
        cell.count(1),
        cell.money(100_000),
        cell.count(1),
        cell.money(40_000),
        cell.count(2),
        cell.money(140_000),
      ],
      [
        cell.text("Sin identificar"),
        cell.count(1),
        cell.money(50_000),
        cell.count(0),
        cell.money(0),
        cell.count(1),
        cell.money(50_000),
      ],
    ],
  });
});

test("has a sheet with the detail of each payment, leaving the missing names and sale empty", () => {
  const sheets = handConfirmedPaymentsSpreadsheet(
    weekHandConfirmedReport,
    "ALL",
    "Todas",
    weekHandConfirmedReport,
  ).sheets;

  expect(sheets[2]).toEqual({
    name: "Detalle de pagos",
    header: ["Confirmado", "Medio", "Venta", "Cajero", "Confirmó", "Importe"],
    rows: [
      [
        cell.instant("2026-10-06T17:00:00.000Z", CONFIRMED_TIME_ZONE),
        cell.text("Transferencia"),
        cell.text("Operación 000007"),
        cell.text("Ana"),
        cell.text("Beto"),
        cell.money(100_000),
      ],
      [
        cell.instant("2026-10-06T15:30:00.000Z", CONFIRMED_TIME_ZONE),
        cell.text("Transferencia"),
        cell.empty(),
        cell.empty(),
        cell.empty(),
        cell.money(50_000),
      ],
      [
        cell.instant("2026-10-05T12:05:00.000Z", CONFIRMED_TIME_ZONE),
        cell.text("Terminal independiente"),
        cell.text("Operación 000009"),
        cell.text("Ana"),
        cell.text("Beto"),
        cell.money(40_000),
      ],
    ],
  });
});
