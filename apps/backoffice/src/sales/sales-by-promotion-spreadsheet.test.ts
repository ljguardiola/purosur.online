import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { salesByPromotionSpreadsheet } from "./sales-by-promotion-spreadsheet";
import {
  noPromotionDiscountsReport,
  promotionDiscountsReport,
} from "./test-support/sales-fixtures";

test("has a Resumen sheet with the period, the register and the figures the screen shows", () => {
  const [summary] = salesByPromotionSpreadsheet(
    promotionDiscountsReport,
    promotionDiscountsReport.rows,
    "Caja del fondo",
  ).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-01")],
      [cell.text("Hasta"), cell.day("2026-10-07")],
      [cell.text("Caja"), cell.text("Caja del fondo")],
      [cell.text("Descontado"), cell.money(213_000)],
      [cell.text("Líneas con promoción"), cell.count(84)],
      [cell.text("Más usada"), cell.text("Tres por dos")],
    ],
  });
});

test("has a sheet named after the table with each promotion, its terms and its figures in the given order", () => {
  const sheets = salesByPromotionSpreadsheet(
    promotionDiscountsReport,
    [...promotionDiscountsReport.rows].reverse(),
    "Todas",
  ).sheets;

  expect(sheets[1]?.name).toBe("Descuentos por promoción");
  expect(sheets[1]?.header).toEqual([
    "Promoción",
    "Condiciones",
    "Líneas",
    "Cantidad (u)",
    "Cantidad (kg)",
    "Descontado",
  ]);
  expect(sheets[1]?.rows).toEqual([
    [
      cell.text("Promoción desconocida"),
      cell.empty(),
      cell.count(4),
      cell.count(0),
      cell.weight(1_250),
      cell.money(3_000),
    ],
    [
      cell.text("Tres por dos"),
      cell.text("Producto · Azúcar Cabriola 1 kg · Lleve 3, pague 2"),
      cell.count(50),
      cell.count(150),
      cell.weight(2_500),
      cell.money(90_000),
    ],
    [
      cell.text("Finde de yerbas"),
      cell.text("Categoría · Almacén › Yerbas · 15 % de descuento · Sábado y domingo"),
      cell.count(30),
      cell.count(45),
      cell.weight(0),
      cell.money(120_000),
    ],
  ]);
});

test("leaves the most used promotion empty and the table without rows when there are no discounts", () => {
  const sheets = salesByPromotionSpreadsheet(noPromotionDiscountsReport, [], "Todas").sheets;

  expect(sheets[0]?.rows.at(-1)).toEqual([cell.text("Más usada"), cell.empty()]);
  expect(sheets[1]?.rows).toEqual([]);
});
