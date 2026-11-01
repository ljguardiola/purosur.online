import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { salesByProductAndCategorySpreadsheet } from "./sales-by-product-and-category-spreadsheet";
import {
  categoryProductsReport,
  noProductsReport,
  productProductsReport,
} from "./test-support/sales-fixtures";

test("has a Resumen sheet with the period, the register, the grouping and the figures the screen shows", () => {
  const [summary] = salesByProductAndCategorySpreadsheet(
    categoryProductsReport,
    categoryProductsReport.rows,
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
      [cell.text("Total vendido"), cell.money(1_000_000)],
      [cell.text("Cantidad (u)"), cell.count(1_842)],
      [cell.text("Cantidad (kg)"), cell.weight(186_400)],
      [cell.text("Categoría principal"), cell.text("Almacén › Dulces")],
    ],
  });
});

test("has the grouping sheet with each category's units, weight, amount and share of the total", () => {
  const sheets = salesByProductAndCategorySpreadsheet(
    categoryProductsReport,
    categoryProductsReport.rows,
    "Todas",
  ).sheets;

  expect(sheets[1]?.name).toBe("Por categoría");
  expect(sheets[1]?.header).toEqual([
    "Categoría",
    "Cantidad (u)",
    "Cantidad (kg)",
    "Importe",
    "Parte del total",
  ]);
  expect(sheets[1]?.rows[0]).toEqual([
    cell.text("Almacén › Dulces"),
    cell.count(1_200),
    cell.weight(0),
    cell.money(410_000),
    { kind: "percent", percent: expect.closeTo(41, 9) },
  ]);
  expect(sheets[1]?.rows[1]).toEqual([
    cell.text("Fiambres"),
    cell.count(42),
    cell.weight(186_400),
    cell.money(300_000),
    { kind: "percent", percent: expect.closeTo(30, 9) },
  ]);
  expect(sheets[1]?.rows[3]?.[0]).toEqual(cell.text("Sin categoría"));
});

test("names products with their brand and net content, and the main product", () => {
  const sheets = salesByProductAndCategorySpreadsheet(
    productProductsReport,
    productProductsReport.rows,
    "Todas",
  ).sheets;

  expect(sheets[1]?.name).toBe("Por producto");
  expect(sheets[1]?.header[0]).toBe("Producto");
  expect(sheets[1]?.rows[1]?.[0]).toEqual(cell.text("Yerba mate Hoja Alta 1 kg"));
  expect(sheets[0]?.rows.at(-1)).toEqual([cell.text("Producto principal"), cell.text("Queso cremoso")]);
});

test("writes the rows it is given in the given order, not the response's", () => {
  const reversed = [...categoryProductsReport.rows].reverse();

  const sheets = salesByProductAndCategorySpreadsheet(categoryProductsReport, reversed, "Todas").sheets;

  expect(sheets[1]?.rows.map((row) => row[0])).toEqual([
    cell.text("Sin categoría"),
    cell.text("Bebidas"),
    cell.text("Fiambres"),
    cell.text("Almacén › Dulces"),
  ]);
});

test("leaves the main category empty and has no rows when there are no sales", () => {
  const sheets = salesByProductAndCategorySpreadsheet(noProductsReport, [], "Todas").sheets;

  expect(sheets[0]?.rows.at(-1)).toEqual([cell.text("Categoría principal"), cell.empty()]);
  expect(sheets[1]?.rows).toEqual([]);
});
