import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { stockBalancesSpreadsheet } from "./stock-balances-spreadsheet";
import {
  almondOil,
  almonds,
  crackers,
  honey,
  stockBalanceList,
} from "./test-support/stock-fixtures";

const list = stockBalanceList([almonds, honey, crackers], {
  productCount: 3,
  valueCents: 25_456_100,
  withoutCostCount: 1,
});

test("has a Resumen sheet with the figures the cloud totals for the whole stock", () => {
  const [summary] = stockBalancesSpreadsheet(list.summary, list.products).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Valorizado a costo"), cell.money(25_456_100)],
      [cell.text("Productos"), cell.count(3)],
      [cell.text("Sin costo"), cell.count(1)],
    ],
  });
});

test("has a sheet with each product given, quantities split by unit and the costs left empty when unknown", () => {
  const sheet = stockBalancesSpreadsheet(list.summary, list.products).sheets[1];

  expect(sheet?.name).toBe("Saldos");
  expect(sheet?.header).toEqual([
    "Producto",
    "Categoría",
    "Lotes",
    "Saldo (u)",
    "Saldo (kg)",
    "Costo unitario",
    "Valorizado",
  ]);
  expect(sheet?.rows).toEqual([
    [
      cell.text("Almendras peladas"),
      cell.text("Frutos secos"),
      cell.count(2),
      cell.empty(),
      cell.weight(12_150),
      cell.money(1_020_584),
      cell.money(12_400_100),
    ],
    [
      cell.text("Miel pura de abeja 1 kg"),
      cell.text("Almacén"),
      cell.count(1),
      cell.count(24),
      cell.empty(),
      cell.money(544_000),
      cell.money(13_056_000),
    ],
    [
      cell.text("Galletas de arroz integrales"),
      cell.text("Almacén"),
      cell.count(1),
      cell.count(-4),
      cell.empty(),
      cell.empty(),
      cell.empty(),
    ],
  ]);
});

test("writes a product with its brand and net content the way the screen names it", () => {
  const sheet = stockBalancesSpreadsheet(list.summary, [almondOil]).sheets[1];

  expect(sheet?.rows[0]?.[0]).toEqual(cell.text("Aceite de Almendras Vitora 30 ml"));
});

test("has a Lotes sheet with the product repeated on each of its lots", () => {
  const sheet = stockBalancesSpreadsheet(list.summary, [almonds, honey]).sheets[2];

  expect(sheet?.name).toBe("Lotes");
  expect(sheet?.header).toEqual([
    "Producto",
    "Categoría",
    "Lote",
    "Vencimiento",
    "Saldo (u)",
    "Saldo (kg)",
    "Costo unitario",
    "Valorizado",
  ]);
  expect(sheet?.rows).toEqual([
    [
      cell.text("Almendras peladas"),
      cell.text("Frutos secos"),
      cell.text("Compra 05/08/2026"),
      cell.day("2026-10-14"),
      cell.empty(),
      cell.weight(4_300),
      cell.money(1_018_000),
      cell.money(4_377_400),
    ],
    [
      cell.text("Almendras peladas"),
      cell.text("Frutos secos"),
      cell.text("Compra 12/09/2026"),
      cell.day("2027-02-28"),
      cell.empty(),
      cell.weight(7_850),
      cell.money(1_022_000),
      cell.money(8_022_700),
    ],
    [
      cell.text("Miel pura de abeja 1 kg"),
      cell.text("Almacén"),
      cell.text("Compra 20/09/2026"),
      cell.empty(),
      cell.count(24),
      cell.empty(),
      cell.money(544_000),
      cell.money(13_056_000),
    ],
  ]);
});
