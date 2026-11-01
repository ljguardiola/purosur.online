import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { manualDiscountsSpreadsheet } from "./manual-discounts-spreadsheet";
import {
  BETO_USER_ID,
  manualDiscountsReport,
  noManualDiscountsReport,
  singleManualDiscountReport,
} from "./test-support/sales-fixtures";

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

test("has a Resumen sheet with the period, the register, the authorizer filter and the figures the screen shows", () => {
  const [summary] = manualDiscountsSpreadsheet(manualDiscountsReport, "ALL", "Caja del fondo").sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-01")],
      [cell.text("Hasta"), cell.day("2026-10-07")],
      [cell.text("Caja"), cell.text("Caja del fondo")],
      [cell.text("Autorizante"), cell.text("Todos")],
      [cell.text("Descontado"), cell.money(155_000)],
      [cell.text("Descuentos"), cell.count(4)],
      [cell.text("De línea"), cell.count(3)],
      [cell.text("Sobre el total"), cell.count(1)],
      [cell.text("Más autorizó"), cell.text("Ana")],
    ],
  });
});

test("names the chosen authorizer and leaves out Más autorizó, as the screen does", () => {
  const [summary] = manualDiscountsSpreadsheet(
    singleManualDiscountReport,
    BETO_USER_ID,
    "Todas",
  ).sheets;

  expect(summary?.rows[3]).toEqual([cell.text("Autorizante"), cell.text("Beto")]);
  expect(summary?.rows.map(([label]) => label)).not.toContainEqual(cell.text("Más autorizó"));
});

test("has a sheet named after the table with each discount as the screen shows it", () => {
  const sheets = manualDiscountsSpreadsheet(manualDiscountsReport, "ALL", "Todas").sheets;

  expect(sheets[1]?.name).toBe("Descuentos manuales");
  expect(sheets[1]?.header).toEqual([
    "Fecha",
    "Venta",
    "Producto",
    "Tipo",
    "Motivo",
    "Autorizó",
    "Descontado",
  ]);
  expect(sheets[1]?.rows).toEqual([
    [
      cell.instant("2026-10-07T14:30:00.000Z", ARGENTINA_TIME_ZONE),
      cell.text("Operación 000012"),
      cell.empty(),
      cell.text("Sobre el total · $ 700,00"),
      cell.text("Cliente frecuente"),
      cell.text("Beto"),
      cell.money(70_000),
    ],
    [
      cell.instant("2026-10-07T13:00:00.000Z", ARGENTINA_TIME_ZONE),
      cell.text("Operación 000011"),
      cell.text("Yerba 1 kg"),
      cell.text("De línea · 10 %"),
      cell.text("Envase dañado"),
      cell.text("Ana"),
      cell.money(20_000),
    ],
    [
      cell.instant("2026-10-07T13:00:00.000Z", ARGENTINA_TIME_ZONE),
      cell.text("Operación 000011"),
      cell.text("Azúcar 1 kg"),
      cell.text("De línea · $ 500,00"),
      cell.text("Regateo"),
      cell.text("Ana"),
      cell.money(50_000),
    ],
    [
      cell.instant("2026-10-06T15:45:00.000Z", ARGENTINA_TIME_ZONE),
      cell.empty(),
      cell.text("Aceite 900 ml"),
      cell.text("Precio nuevo"),
      cell.text("Vencimiento cercano"),
      cell.text("Sin identificar"),
      cell.money(15_000),
    ],
  ]);
});

test("leaves the most authorized empty and the table without rows when there are no discounts", () => {
  const sheets = manualDiscountsSpreadsheet(noManualDiscountsReport, "ALL", "Todas").sheets;

  expect(sheets[0]?.rows.at(-1)).toEqual([cell.text("Más autorizó"), cell.empty()]);
  expect(sheets[1]?.rows).toEqual([]);
});
