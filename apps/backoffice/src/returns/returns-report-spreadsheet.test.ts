import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { OCCURRED_TIME_ZONE } from "./returns-report-occurred-time-zone";
import { returnsReportSpreadsheet } from "./returns-report-spreadsheet";
import {
  noReturnsReport,
  returnsReport,
  scannedReturnWithoutLinesReport,
} from "./test-support/returns-fixtures";

const HEADER = [
  "Fecha",
  "Caja",
  "Venta",
  "Comprobante",
  "Cajero",
  "Autorizó",
  "Producto",
  "Cantidad (u)",
  "Cantidad (kg)",
  "Motivo",
  "Destino",
  "Resolución",
  "Reintegrado",
];

const PERSON_HEADER = [
  "Anulaciones",
  "Anulado",
  "Devoluciones",
  "Reintegrado",
  "Líneas reintegradas",
  "Líneas cambiadas",
  "Iniciadas a mano",
];

test("has a Resumen sheet with the period, the register and the figures the screen shows", () => {
  const [summary] = returnsReportSpreadsheet(returnsReport, "Caja del fondo").sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-01")],
      [cell.text("Hasta"), cell.day("2026-10-07")],
      [cell.text("Caja"), cell.text("Caja del fondo")],
      [cell.text("Anulaciones"), cell.count(2)],
      [cell.text("Anulado"), cell.money(830_000)],
      [cell.text("Devoluciones"), cell.count(3)],
      [cell.text("Reintegrado"), cell.money(575_000)],
      [cell.text("Cambios"), cell.count(1)],
      [cell.text("Iniciadas a mano"), cell.count(2)],
    ],
  });
});

test("has a sheet for the voids, one for each summary and one for each way a return starts, typed first", () => {
  const sheets = returnsReportSpreadsheet(returnsReport, "Todas").sheets;

  expect(sheets.map(({ name }) => name)).toEqual([
    "Resumen",
    "Anulaciones",
    "Por cajero",
    "Por quién autorizó",
    "Iniciadas con el número tipeado",
    "Iniciadas escaneando el QR",
  ]);
  expect(sheets[4]?.header).toEqual(HEADER);
  expect(sheets[5]?.header).toEqual(HEADER);
});

test("lists each void with its moment, register, sale, people and total, leaving an absent authorizer empty", () => {
  const voids = returnsReportSpreadsheet(returnsReport, "Todas").sheets[1];

  expect(voids?.header).toEqual([
    "Fecha",
    "Caja",
    "Venta",
    "Comprobante",
    "Cajero",
    "Autorizó",
    "Total",
  ]);
  expect(voids?.rows).toEqual([
    [
      cell.instant("2026-10-05T13:15:00.000Z", OCCURRED_TIME_ZONE),
      cell.text("Caja principal"),
      cell.text("Operación 000020"),
      cell.text("Comprobante 00005-00000052"),
      cell.text("Carla"),
      cell.text("Beto"),
      cell.money(520_000),
    ],
    [
      cell.instant("2026-10-04T16:00:00.000Z", OCCURRED_TIME_ZONE),
      cell.text("Caja del fondo"),
      cell.empty(),
      cell.empty(),
      cell.text("Sin dato"),
      cell.empty(),
      cell.money(310_000),
    ],
  ]);
});

test("summarizes each cashier and each authorizer, naming who has no name, no cashier or no authorization", () => {
  const [, , byCashier, byAuthorizer] = returnsReportSpreadsheet(returnsReport, "Todas").sheets;

  expect(byCashier?.header).toEqual(["Cajero", ...PERSON_HEADER]);
  expect(byCashier?.rows.map((row) => row[0])).toEqual([
    cell.text("Carla"),
    cell.text("Dora"),
    cell.text("Sin identificar"),
    cell.text("Sin dato"),
  ]);
  expect(byCashier?.rows[1]).toEqual([
    cell.text("Dora"),
    cell.count(0),
    cell.money(0),
    cell.count(1),
    cell.money(150_000),
    cell.count(1),
    cell.count(1),
    cell.count(0),
  ]);
  expect(byAuthorizer?.header).toEqual(["Autorizó", ...PERSON_HEADER]);
  expect(byAuthorizer?.rows).toEqual([
    [
      cell.text("Beto"),
      cell.count(1),
      cell.money(520_000),
      cell.count(1),
      cell.money(345_000),
      cell.count(2),
      cell.count(0),
      cell.count(1),
    ],
    [
      cell.text("Sin autorización"),
      cell.count(1),
      cell.money(310_000),
      cell.count(2),
      cell.money(230_000),
      cell.count(2),
      cell.count(1),
      cell.count(1),
    ],
  ]);
});

test("has a row for each returned line, repeating what belongs to the return but its refund, and splitting the quantity by unit", () => {
  const typed = returnsReportSpreadsheet(returnsReport, "Todas").sheets[4];

  expect(typed?.rows).toEqual([
    [
      cell.instant("2026-10-07T14:30:00.000Z", OCCURRED_TIME_ZONE),
      cell.text("Caja principal"),
      cell.text("Operación 000012"),
      cell.text("Comprobante 00005-00000041"),
      cell.text("Carla"),
      cell.text("Beto"),
      cell.text("Yerba 1 kg"),
      cell.count(2),
      cell.empty(),
      cell.text("Defecto"),
      cell.text("se descarta"),
      cell.text("Reintegro"),
      cell.money(345_000),
    ],
    [
      cell.instant("2026-10-07T14:30:00.000Z", OCCURRED_TIME_ZONE),
      cell.text("Caja principal"),
      cell.text("Operación 000012"),
      cell.text("Comprobante 00005-00000041"),
      cell.text("Carla"),
      cell.text("Beto"),
      cell.text("Queso cremoso"),
      cell.empty(),
      cell.weight(350),
      cell.text("Arrepentimiento"),
      cell.text("vuelve a la venta"),
      cell.text("Reintegro"),
      cell.empty(),
    ],
    [
      cell.instant("2026-10-06T15:45:00.000Z", OCCURRED_TIME_ZONE),
      cell.text("Caja principal"),
      cell.empty(),
      cell.empty(),
      cell.text("Sin identificar"),
      cell.empty(),
      cell.text("Aceite 900 ml"),
      cell.count(1),
      cell.empty(),
      cell.text("Arrepentimiento"),
      cell.text("vuelve a la venta"),
      cell.text("Reintegro"),
      cell.money(80_000),
    ],
  ]);
});

test("puts the scanned returns on their own sheet", () => {
  const scanned = returnsReportSpreadsheet(returnsReport, "Todas").sheets[5];

  expect(scanned?.rows).toEqual([
    [
      cell.instant("2026-10-07T02:30:00.000Z", OCCURRED_TIME_ZONE),
      cell.text("Caja del fondo"),
      cell.text("Operación 000009"),
      cell.empty(),
      cell.text("Dora"),
      cell.empty(),
      cell.text("Azúcar 1 kg"),
      cell.count(3),
      cell.empty(),
      cell.text("Defecto"),
      cell.text("vuelve a la venta"),
      cell.text("Reintegro"),
      cell.money(150_000),
    ],
    [
      cell.instant("2026-10-07T02:30:00.000Z", OCCURRED_TIME_ZONE),
      cell.text("Caja del fondo"),
      cell.text("Operación 000009"),
      cell.empty(),
      cell.text("Dora"),
      cell.empty(),
      cell.text("Fideos 500 g"),
      cell.count(1),
      cell.empty(),
      cell.text("Arrepentimiento"),
      cell.text("vuelve a la venta"),
      cell.text("Cambio"),
      cell.empty(),
    ],
  ]);
});

test("keeps a return without lines as one row with no product", () => {
  const scanned = returnsReportSpreadsheet(scannedReturnWithoutLinesReport, "Todas").sheets[5];

  expect(scanned?.rows).toHaveLength(1);
  expect(scanned?.rows[0]?.slice(6, 12)).toEqual([
    cell.empty(),
    cell.empty(),
    cell.empty(),
    cell.empty(),
    cell.empty(),
    cell.empty(),
  ]);
  expect(scanned?.rows[0]?.[12]).toEqual(cell.money(150_000));
});

test("has no rows in the table sheets when there are no voids and no returns", () => {
  const sheets = returnsReportSpreadsheet(noReturnsReport, "Todas").sheets;

  expect(sheets.slice(1).map(({ rows }) => rows)).toEqual([[], [], [], [], []]);
});

test("writes each return's refund once, so the column adds up to the refunded total", () => {
  const typed = returnsReportSpreadsheet(returnsReport, "Todas").sheets[4];

  expect(typed?.rows.map((row) => row[12])).toEqual([
    cell.money(345_000),
    cell.empty(),
    cell.money(80_000),
  ]);
});
