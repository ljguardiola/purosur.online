import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { lossesByReasonReportSpreadsheet } from "./losses-by-reason-report-spreadsheet";
import {
  almondOilReason,
  defectiveExchangeReason,
  expiredReason,
  lossesByReasonReport,
  spoiledReason,
} from "./test-support/losses-by-reason-report-fixtures";

test("has a Resumen sheet with the period, the totals and the losses of each reason", () => {
  const [summary] = lossesByReasonReportSpreadsheet(lossesByReasonReport()).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-01")],
      [cell.text("Hasta"), cell.day("2026-10-31")],
      [cell.text("Pérdidas"), cell.count(4)],
      [cell.text("Motivos"), cell.count(2)],
      [cell.text("Mal estado (pérdidas)"), cell.count(3)],
      [cell.text("Vencimiento (pérdidas)"), cell.count(1)],
    ],
  });
});

test("has a sheet per reason, named after it and in the order the cloud answers them, with quantities split by unit", () => {
  const sheets = lossesByReasonReportSpreadsheet(
    lossesByReasonReport([spoiledReason, expiredReason, almondOilReason]),
  ).sheets;

  expect(sheets.map(({ name }) => name)).toEqual([
    "Resumen",
    "Mal estado",
    "Vencimiento",
    "Rotura o derrame",
  ]);
  expect(sheets[1]).toEqual({
    name: "Mal estado",
    header: ["Producto", "Cantidad (u)", "Cantidad (kg)", "Pérdidas"],
    rows: [
      [cell.text("Queso cremoso"), cell.empty(), cell.weight(2_500), cell.count(2)],
      [cell.text("Pan lactal"), cell.count(3), cell.empty(), cell.count(1)],
    ],
  });
  expect(sheets[3]?.rows).toEqual([
    [cell.text("Aceite de Almendras Vitora 30 ml"), cell.count(1), cell.empty(), cell.count(1)],
  ]);
});

test("has only the Resumen sheet when there are no losses", () => {
  const sheets = lossesByReasonReportSpreadsheet(lossesByReasonReport([])).sheets;

  expect(sheets.map(({ name }) => name)).toEqual(["Resumen"]);
  expect(sheets[0]?.rows.slice(2)).toEqual([
    [cell.text("Pérdidas"), cell.count(0)],
    [cell.text("Motivos"), cell.count(0)],
  ]);
});

test("names the sheet and the summary row of the replacements of defective exchanges as Cambio por defectuoso", () => {
  const [summary, sheet] = lossesByReasonReportSpreadsheet(
    lossesByReasonReport([defectiveExchangeReason]),
  ).sheets;

  expect(summary?.rows.at(-1)).toEqual([
    cell.text("Cambio por defectuoso (pérdidas)"),
    cell.count(1),
  ]);
  expect(sheet).toEqual({
    name: "Cambio por defectuoso",
    header: ["Producto", "Cantidad (u)", "Cantidad (kg)", "Pérdidas"],
    rows: [[cell.text("Queso cremoso"), cell.empty(), cell.weight(1_000), cell.count(1)]],
  });
});
