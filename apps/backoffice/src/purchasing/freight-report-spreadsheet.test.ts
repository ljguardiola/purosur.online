import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { freightReportSpreadsheet } from "./freight-report-spreadsheet";
import { emptyFreightReport, quarterFreightReport } from "./test-support/freight-report-fixtures";

test("has a Resumen sheet with the period and the figures the screen shows", () => {
  const [summary] = freightReportSpreadsheet(quarterFreightReport).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-09-01")],
      [cell.text("Hasta"), cell.day("2026-10-31")],
      [cell.text("Total de fletes"), cell.money(175_050)],
      [cell.text("Fletes"), cell.count(3)],
    ],
  });
});

test("has a sheet named after the table with a row for each month, each month a date", () => {
  const sheets = freightReportSpreadsheet(quarterFreightReport).sheets;

  expect(sheets[1]).toEqual({
    name: "Flete por período",
    header: ["Mes", "Fletes", "Monto"],
    rows: [
      [cell.month("2026-09"), cell.count(1), cell.money(45_000)],
      [cell.month("2026-10"), cell.count(2), cell.money(130_050)],
    ],
  });
});

test("has no rows in the table sheet when there are no freights", () => {
  const sheets = freightReportSpreadsheet(emptyFreightReport).sheets;

  expect(sheets[1]?.rows).toEqual([]);
});
