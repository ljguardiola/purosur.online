import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { handTypedWeightsSpreadsheet } from "./hand-typed-weights-spreadsheet";
import {
  handTypedWeightsReport,
  noHandTypedWeightsReport,
} from "./test-support/hand-typed-weights-fixtures";

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

test("has a Resumen sheet with the period, the register and the figures the screen shows", () => {
  const [summary] = handTypedWeightsSpreadsheet(handTypedWeightsReport, "Caja del fondo").sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-01")],
      [cell.text("Hasta"), cell.day("2026-10-07")],
      [cell.text("Caja"), cell.text("Caja del fondo")],
      [cell.text("Líneas pesadas"), cell.count(42)],
      [cell.text("Tipeadas a mano"), cell.count(9)],
      [cell.text("Más tipeó"), cell.text("Beto")],
    ],
  });
});

test("has a sheet Por cajero with each cashier's weighed and hand-typed lines", () => {
  const sheets = handTypedWeightsSpreadsheet(handTypedWeightsReport, "Todas").sheets;

  expect(sheets[1]).toEqual({
    name: "Por cajero",
    header: ["Cajero", "Pesadas", "Tipeadas a mano"],
    rows: [
      [cell.text("Beto"), cell.count(10), cell.count(6)],
      [cell.text("Sin identificar"), cell.count(2), cell.count(2)],
      [cell.text("Ana"), cell.count(30), cell.count(1)],
    ],
  });
});

test("has a sheet Por sesión with each session's register, opening instant and lines", () => {
  const sheets = handTypedWeightsSpreadsheet(handTypedWeightsReport, "Todas").sheets;

  expect(sheets[2]).toEqual({
    name: "Por sesión",
    header: ["Caja", "Apertura", "Pesadas", "Tipeadas a mano"],
    rows: [
      [
        cell.text("Caja principal"),
        cell.instant("2026-10-06T11:30:00.000Z", ARGENTINA_TIME_ZONE),
        cell.count(12),
        cell.count(8),
      ],
      [
        cell.text("Caja del fondo"),
        cell.instant("2026-10-05T21:05:00.000Z", ARGENTINA_TIME_ZONE),
        cell.count(30),
        cell.count(1),
      ],
    ],
  });
});

test("leaves the most typed empty and both tables without rows when nothing was weighed", () => {
  const sheets = handTypedWeightsSpreadsheet(noHandTypedWeightsReport, "Todas").sheets;

  expect(sheets[0]?.rows.at(-1)).toEqual([cell.text("Más tipeó"), cell.empty()]);
  expect(sheets[1]?.rows).toEqual([]);
  expect(sheets[2]?.rows).toEqual([]);
});
