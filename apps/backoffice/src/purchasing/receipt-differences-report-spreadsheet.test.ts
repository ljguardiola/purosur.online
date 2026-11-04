import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { receiptDifferencesReportSpreadsheet } from "./receipt-differences-report-spreadsheet";
import {
  emptyReceiptDifferencesReport,
  receiptDifferencesReport,
} from "./test-support/receipt-differences-report-fixtures";

test("has a Resumen sheet with the period, the figures the screen shows and how many suppliers had a difference", () => {
  const [summary] = receiptDifferencesReportSpreadsheet(receiptDifferencesReport).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-09-01")],
      [cell.text("Hasta"), cell.day("2026-11-04")],
      [cell.text("Líneas con faltante"), cell.count(2)],
      [cell.text("Líneas con diferencia de precio"), cell.count(2)],
      [cell.text("Diferencia de precio neta"), cell.money(10_500)],
      [cell.text("Proveedores"), cell.count(2)],
    ],
  });
});

test("has a sheet with a row for each receipt line, in the order the screen lists them", () => {
  const sheets = receiptDifferencesReportSpreadsheet(receiptDifferencesReport).sheets;

  expect(sheets[1]).toEqual({
    name: "Diferencias de recepción",
    header: [
      "Proveedor",
      "Mes",
      "Día de recepción",
      "Producto",
      "Recibido (u)",
      "Recibido (kg)",
      "Faltante (u)",
      "Faltante (kg)",
      "Diferencia de precio",
    ],
    rows: [
      [
        cell.text("Distribuidora Andina"),
        cell.month("2026-10"),
        cell.day("2026-10-07"),
        cell.text("Miel pura de abeja 1 kg"),
        cell.count(8),
        cell.empty(),
        cell.count(2),
        cell.empty(),
        cell.money(15_000),
      ],
      [
        cell.text("Distribuidora Andina"),
        cell.month("2026-10"),
        cell.day("2026-10-21"),
        cell.text("Avena arrollada"),
        cell.empty(),
        cell.weight(5_000),
        cell.empty(),
        cell.weight(2_500),
        cell.empty(),
      ],
      [
        cell.text("Granos del Sur"),
        cell.month("2026-09"),
        cell.day("2026-09-30"),
        cell.text("Aceite de Almendras Vitora 30 ml"),
        cell.count(3),
        cell.empty(),
        cell.count(0),
        cell.empty(),
        cell.money(-4_500),
      ],
    ],
  });
});

test("has no rows in the table sheet when there are no differences", () => {
  const [, table] = receiptDifferencesReportSpreadsheet(emptyReceiptDifferencesReport).sheets;

  expect(table?.rows).toEqual([]);
});
