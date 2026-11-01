import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { REVIEW_TIME_ZONE } from "./prices-past-review-deadline-moments";
import { pricesPastReviewDeadlineReportSpreadsheet } from "./prices-past-review-deadline-report-spreadsheet";
import {
  neverReviewedOil,
  overdueCheese,
  postponedBread,
  pricesPastReviewDeadlineReport,
} from "./test-support/prices-past-review-deadline-report-fixtures";

const report = pricesPastReviewDeadlineReport([neverReviewedOil, overdueCheese, postponedBread]);

test("has a Resumen sheet with the period, the review window and the figure the screen shows", () => {
  const [summary] = pricesPastReviewDeadlineReportSpreadsheet(report).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-08-31")],
      [cell.text("Hasta"), cell.day("2026-10-13")],
      [cell.text("Plazo de revisión (días)"), cell.count(30)],
      [cell.text("Precios"), cell.count(3)],
    ],
  });
});

test("has a sheet named after the table with each price, split by unit, leaving what the screen shows as missing empty", () => {
  const sheets = pricesPastReviewDeadlineReportSpreadsheet(report).sheets;

  expect(sheets[1]?.name).toBe("Precios sin revisar");
  expect(sheets[1]?.header).toEqual([
    "Producto",
    "Categoría",
    "Precio actual (u)",
    "Precio actual (kg)",
    "Última revisión",
    "Venció el",
    "Motivo",
  ]);
  expect(sheets[1]?.rows).toEqual([
    [
      cell.text("Aceite de Almendras Vitora 30 ml"),
      cell.text("Almacén"),
      cell.empty(),
      cell.empty(),
      cell.empty(),
      cell.empty(),
      cell.text("Nunca revisado"),
    ],
    [
      cell.text("Queso cremoso"),
      cell.text("Lácteos"),
      cell.empty(),
      cell.money(1_250_000),
      cell.instant("2026-08-01T13:00:00.000Z", REVIEW_TIME_ZONE),
      cell.day("2026-08-31"),
      cell.text("Plazo vencido"),
    ],
    [
      cell.text("Pan lactal"),
      cell.text("Panificados"),
      cell.money(320_000),
      cell.empty(),
      cell.instant("2026-09-10T15:30:00.000Z", REVIEW_TIME_ZONE),
      cell.day("2026-10-10"),
      cell.text("Postergado en una compra"),
    ],
  ]);
});
