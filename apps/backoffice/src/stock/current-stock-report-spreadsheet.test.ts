import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { currentStockReportSpreadsheet } from "./current-stock-report-spreadsheet";
import {
  almondOilProduct,
  almondsProduct,
  crackersProduct,
  currentStockReport,
  teaProduct,
  yerbaProduct,
} from "./test-support/current-stock-report-fixtures";

const report = currentStockReport();

test("has a Resumen sheet with the category and the figures the screen shows, and no period", () => {
  const [summary] = currentStockReportSpreadsheet(report, report.products, "Todas").sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Categoría"), cell.text("Todas")],
      [cell.text("Valorizado a costo"), cell.money(15_760_100)],
      [cell.text("Productos"), cell.count(4)],
      [cell.text("Con saldo negativo"), cell.count(1)],
      [cell.text("Sin costo"), cell.count(1)],
    ],
  });
});

test("has a sheet named after the table with each product, quantities split by unit and the share of the total", () => {
  const products = [almondsProduct, yerbaProduct, crackersProduct, teaProduct];
  const sheets = currentStockReportSpreadsheet(
    currentStockReport(products),
    products,
    "Todas",
  ).sheets;

  expect(sheets[1]?.name).toBe("Stock actual valorizado");
  expect(sheets[1]?.header).toEqual([
    "Producto",
    "Categoría",
    "Lotes",
    "Saldo (u)",
    "Saldo (kg)",
    "Valorizado",
    "Parte del total",
  ]);
  expect(sheets[1]?.rows).toEqual([
    [
      cell.text("Almendras peladas"),
      cell.text("Frutos secos"),
      cell.count(2),
      cell.empty(),
      cell.weight(12_150),
      cell.money(12_400_100),
      { kind: "percent", percent: expect.closeTo((12_400_100 / 16_000_100) * 100, 9) },
    ],
    [
      cell.text("Yerba mate 1 kg"),
      cell.text("Almacén"),
      cell.count(1),
      cell.count(24),
      cell.empty(),
      cell.money(3_600_000),
      { kind: "percent", percent: expect.closeTo((3_600_000 / 16_000_100) * 100, 9) },
    ],
    [
      cell.text("Galletas de arroz"),
      cell.text("Almacén"),
      cell.count(1),
      cell.count(-4),
      cell.empty(),
      cell.money(-240_000),
      cell.empty(),
    ],
    [
      cell.text("Té verde en hebras"),
      cell.text("Almacén"),
      cell.count(1),
      cell.count(6),
      cell.empty(),
      cell.empty(),
      cell.empty(),
    ],
  ]);
});

test("writes a product with its brand and net content the way the screen names it", () => {
  const sheets = currentStockReportSpreadsheet(
    currentStockReport([almondOilProduct]),
    [almondOilProduct],
    "Todas",
  ).sheets;

  expect(sheets[1]?.rows[0]?.[0]).toEqual(cell.text("Aceite de Almendras Vitora 30 ml"));
});

test("has a Lotes sheet with the product repeated on each of its lots", () => {
  const products = [almondsProduct, yerbaProduct, crackersProduct, teaProduct];
  const sheets = currentStockReportSpreadsheet(
    currentStockReport(products),
    products,
    "Todas",
  ).sheets;

  expect(sheets[2]?.name).toBe("Lotes");
  expect(sheets[2]?.header).toEqual([
    "Producto",
    "Categoría",
    "Lote",
    "Código",
    "Vencimiento",
    "Saldo (u)",
    "Saldo (kg)",
    "Costo unitario",
    "Valorizado",
  ]);
  expect(sheets[2]?.rows).toEqual([
    [
      cell.text("Almendras peladas"),
      cell.text("Frutos secos"),
      cell.text("Compra 01/09/2026"),
      cell.text("L-000101"),
      cell.day("2026-10-14"),
      cell.empty(),
      cell.weight(4_300),
      cell.money(1_018_000),
      cell.money(4_377_400),
    ],
    [
      cell.text("Almendras peladas"),
      cell.text("Frutos secos"),
      cell.text("Compra 05/09/2026"),
      cell.text("L-000102"),
      cell.day("2027-02-28"),
      cell.empty(),
      cell.weight(7_850),
      cell.money(1_022_000),
      cell.money(8_022_700),
    ],
    [
      cell.text("Yerba mate 1 kg"),
      cell.text("Almacén"),
      cell.text("Técnico 07/10/2026"),
      cell.text("L-000103"),
      cell.empty(),
      cell.count(24),
      cell.empty(),
      cell.money(150_000),
      cell.money(3_600_000),
    ],
    [
      cell.text("Galletas de arroz"),
      cell.text("Almacén"),
      cell.text("Técnico 07/10/2026"),
      cell.text("L-000104"),
      cell.empty(),
      cell.count(-4),
      cell.empty(),
      cell.money(60_000),
      cell.money(-240_000),
    ],
    [
      cell.text("Té verde en hebras"),
      cell.text("Almacén"),
      cell.text("Técnico 07/10/2026"),
      cell.text("L-000105"),
      cell.day("2027-01-31"),
      cell.count(6),
      cell.empty(),
      cell.empty(),
      cell.empty(),
    ],
  ]);
});

test("follows the order of the products it is given", () => {
  const products = [teaProduct, almondsProduct];
  const sheets = currentStockReportSpreadsheet(
    currentStockReport(products),
    products,
    "Todas",
  ).sheets;

  expect(sheets[1]?.rows.map(([name]) => name)).toEqual([
    cell.text("Té verde en hebras"),
    cell.text("Almendras peladas"),
  ]);
  expect(sheets[2]?.rows[0]?.[0]).toEqual(cell.text("Té verde en hebras"));
});
