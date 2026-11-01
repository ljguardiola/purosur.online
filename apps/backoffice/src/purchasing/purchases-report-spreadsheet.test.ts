import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { purchasesReportSpreadsheet } from "./purchases-report-spreadsheet";
import {
  emptyPurchasesReport,
  quarterPurchasesReport,
} from "./test-support/purchases-report-fixtures";

test("has a Resumen sheet with the period and the figures the screen shows", () => {
  const [summary] = purchasesReportSpreadsheet(quarterPurchasesReport).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-09-01")],
      [cell.text("Hasta"), cell.day("2026-10-31")],
      [cell.text("Total comprado"), cell.money(257_550)],
      [cell.text("Compras"), cell.count(4)],
      [cell.text("Proveedores"), cell.count(2)],
    ],
  });
});

test("has a sheet named after the table with a row for each month of each supplier, in the order the screen lists them", () => {
  const sheets = purchasesReportSpreadsheet(quarterPurchasesReport).sheets;

  expect(sheets[1]).toEqual({
    name: "Compras por proveedor",
    header: ["Proveedor", "Mes", "Compras", "Importe"],
    rows: [
      [
        cell.text("Lácteos del Sur"),
        cell.text("septiembre de 2026"),
        cell.count(1),
        cell.money(45_000),
      ],
      [
        cell.text("Lácteos del Sur"),
        cell.text("octubre de 2026"),
        cell.count(2),
        cell.money(130_050),
      ],
      [
        cell.text("Panificados Norte"),
        cell.text("octubre de 2026"),
        cell.count(1),
        cell.money(82_500),
      ],
    ],
  });
});

test("has a sheet with what each supplier bought in all the months", () => {
  const sheets = purchasesReportSpreadsheet(quarterPurchasesReport).sheets;

  expect(sheets[2]).toEqual({
    name: "Totales por proveedor",
    header: ["Proveedor", "Compras", "Importe"],
    rows: [
      [cell.text("Lácteos del Sur"), cell.count(3), cell.money(175_050)],
      [cell.text("Panificados Norte"), cell.count(1), cell.money(82_500)],
    ],
  });
});

test("has no rows in the table sheets when there are no purchases", () => {
  const sheets = purchasesReportSpreadsheet(emptyPurchasesReport).sheets;

  expect(sheets.slice(1).map(({ rows }) => rows)).toEqual([[], []]);
});
