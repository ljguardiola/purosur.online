import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { expiringLotsReportSpreadsheet } from "./expiring-lots-report-spreadsheet";
import {
  almondOilLot,
  breadLot,
  cheeseLot,
  expiredYogurtLot,
  expiringLotsReport,
} from "./test-support/expiring-lots-report-fixtures";

const lots = [cheeseLot, breadLot, expiredYogurtLot, almondOilLot];

test("has a Resumen sheet with the period, the notice window and the figures the screen shows", () => {
  const [summary] = expiringLotsReportSpreadsheet(expiringLotsReport(lots)).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-13")],
      [cell.text("Hasta"), cell.day("2026-11-12")],
      [cell.text("Ventana de aviso de la sucursal (días)"), cell.count(30)],
      [cell.text("Lotes"), cell.count(4)],
      [cell.text("Valor al costo"), cell.money(6_177_400)],
      [cell.text("Sin costo"), cell.count(1)],
    ],
  });
});

test("has a sheet named after the table with each lot, quantities split by unit and a missing cost left empty", () => {
  const sheets = expiringLotsReportSpreadsheet(expiringLotsReport(lots)).sheets;

  expect(sheets[1]?.name).toBe("Lotes por vencer");
  expect(sheets[1]?.header).toEqual([
    "Producto",
    "Categoría",
    "Lote",
    "Código",
    "Vence",
    "Días",
    "Cantidad (u)",
    "Cantidad (kg)",
    "Valor",
  ]);
  expect(sheets[1]?.rows).toEqual([
    [
      cell.text("Queso cremoso"),
      cell.text("Lácteos"),
      cell.text("Compra 01/09/2026"),
      cell.text("L-000101"),
      cell.day("2026-10-16"),
      cell.count(3),
      cell.empty(),
      cell.weight(4_300),
      cell.money(4_377_400),
    ],
    [
      cell.text("Pan lactal"),
      cell.text("Panificados"),
      cell.text("Técnico 07/10/2026"),
      cell.text("L-000102"),
      cell.day("2026-10-30"),
      cell.count(17),
      cell.count(12),
      cell.empty(),
      cell.empty(),
    ],
    [
      cell.text("Yogur natural"),
      cell.text("Lácteos"),
      cell.text("Compra 08/10/2026"),
      cell.text("L-000103"),
      cell.day("2026-10-10"),
      cell.count(-3),
      cell.count(6),
      cell.empty(),
      cell.money(900_000),
    ],
    [
      cell.text("Aceite de Almendras Vitora 30 ml"),
      cell.text("Almacén"),
      cell.text("Compra 09/10/2026"),
      cell.text("L-000104"),
      cell.day("2026-10-20"),
      cell.count(7),
      cell.count(6),
      cell.empty(),
      cell.money(900_000),
    ],
  ]);
});
