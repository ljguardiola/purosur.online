import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { issuedFiscalDocumentsReportSpreadsheet } from "./issued-fiscal-documents-report-spreadsheet";
import {
  issuedFiscalDocumentsReport,
  noIssuedFiscalDocumentsReport,
} from "./test-support/issued-fiscal-documents-report-fixtures";

test("has a Resumen sheet with the period, the register and the figures the screen shows", () => {
  const [summary] = issuedFiscalDocumentsReportSpreadsheet(
    issuedFiscalDocumentsReport,
    issuedFiscalDocumentsReport.rows,
    "Caja del fondo",
  ).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-01")],
      [cell.text("Hasta"), cell.day("2026-10-07")],
      [cell.text("Caja"), cell.text("Caja del fondo")],
      [cell.text("Facturas"), cell.money(2_000_000)],
      [cell.text("Cantidad de facturas"), cell.count(17)],
      [cell.text("Notas de crédito"), cell.money(-50_000)],
      [cell.text("Cantidad de notas de crédito"), cell.count(1)],
      [cell.text("Total neto"), cell.money(1_950_000)],
      [cell.text("Emitidos con CAEA"), cell.count(3)],
      [cell.text("Parte emitida con CAEA"), cell.percent(16.7)],
    ],
  });
});

test("has a sheet named after the table with each voucher group in the given order", () => {
  const sheets = issuedFiscalDocumentsReportSpreadsheet(
    issuedFiscalDocumentsReport,
    [...issuedFiscalDocumentsReport.rows].reverse().slice(0, 2),
    "Todas",
  ).sheets;

  expect(sheets[1]).toEqual({
    name: "Comprobantes emitidos",
    header: ["Comprobante", "Punto de venta", "Autorización", "Cantidad", "Importe"],
    rows: [
      [
        cell.text("Nota de crédito C"),
        cell.text("00005"),
        cell.text("CAE"),
        cell.count(1),
        cell.money(-50_000),
      ],
      [
        cell.text("Factura C"),
        cell.text("00007"),
        cell.text("CAE"),
        cell.count(2),
        cell.money(200_000),
      ],
    ],
  });
});

test("leaves the share of CAEA empty and the table without rows when nothing was issued", () => {
  const sheets = issuedFiscalDocumentsReportSpreadsheet(
    noIssuedFiscalDocumentsReport,
    [],
    "Todas",
  ).sheets;

  expect(sheets[0]?.rows.slice(-2)).toEqual([
    [cell.text("Emitidos con CAEA"), cell.count(0)],
    [cell.text("Parte emitida con CAEA"), cell.empty()],
  ]);
  expect(sheets[1]?.rows).toEqual([]);
});
