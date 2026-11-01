import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { marginReportSpreadsheet } from "./margin-report-spreadsheet";
import {
  categoryMarginReport,
  completeMarginReport,
  productMarginReport,
} from "./test-support/margin-report-fixtures";

test("has a Resumen sheet with the period, the register, the grouping and the figures the screen shows", () => {
  const [summary] = marginReportSpreadsheet(
    categoryMarginReport,
    categoryMarginReport.rows,
    "Caja del fondo",
  ).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-01")],
      [cell.text("Hasta"), cell.day("2026-10-07")],
      [cell.text("Caja"), cell.text("Caja del fondo")],
      [cell.text("Agrupar"), cell.text("Por categoría")],
      [cell.text("Vendido"), cell.money(1_000_000)],
      [cell.text("Costo"), cell.money(670_000)],
      [cell.text("Margen"), cell.money(330_000)],
      [cell.text("Ventas con costo incompleto"), cell.count(2)],
    ],
  });
});

test("has a sheet named after the grouping with each category's amount sold, cost, incomplete sales and margin", () => {
  const sheets = marginReportSpreadsheet(
    categoryMarginReport,
    categoryMarginReport.rows,
    "Todas",
  ).sheets;

  expect(sheets[1]).toEqual({
    name: "Por categoría",
    header: ["Categoría", "Vendido", "Costo", "Costo incompleto (ventas)", "Margen"],
    rows: [
      [
        cell.text("Almacén › Dulces"),
        cell.money(410_000),
        cell.money(250_000),
        cell.count(0),
        cell.money(160_000),
      ],
      [
        cell.text("Fiambres"),
        cell.money(300_000),
        cell.money(180_000),
        cell.count(2),
        cell.money(120_000),
      ],
      [
        cell.text("Bebidas"),
        cell.money(190_000),
        cell.money(200_000),
        cell.count(0),
        cell.money(-10_000),
      ],
      [
        cell.text("Sin categoría"),
        cell.money(100_000),
        cell.money(40_000),
        cell.count(0),
        cell.money(60_000),
      ],
    ],
  });
});

test("names each product with its brand and net content under the Por producto sheet", () => {
  const sheets = marginReportSpreadsheet(
    productMarginReport,
    productMarginReport.rows,
    "Todas",
  ).sheets;

  expect(sheets[1]?.name).toBe("Por producto");
  expect(sheets[1]?.header[0]).toBe("Producto");
  expect(sheets[1]?.rows.map(([name]) => name)).toEqual([
    cell.text("Queso cremoso"),
    cell.text("Yerba mate Hoja Alta 1 kg"),
  ]);
});

test("counts no sale with an incomplete cost when every cost is known", () => {
  const [summary] = marginReportSpreadsheet(
    completeMarginReport,
    completeMarginReport.rows,
    "Todas",
  ).sheets;

  expect(summary?.rows.at(-1)).toEqual([cell.text("Ventas con costo incompleto"), cell.count(0)]);
});

test("writes only the rows it is given, in their order", () => {
  const rows = [...categoryMarginReport.rows].reverse().slice(0, 2);

  const sheets = marginReportSpreadsheet(categoryMarginReport, rows, "Todas").sheets;

  expect(sheets[1]?.rows.map(([name]) => name)).toEqual([
    cell.text("Sin categoría"),
    cell.text("Bebidas"),
  ]);
});
