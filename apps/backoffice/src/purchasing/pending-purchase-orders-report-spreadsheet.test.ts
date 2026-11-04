import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { pendingPurchaseOrdersReportSpreadsheet } from "./pending-purchase-orders-report-spreadsheet";
import {
  emptyPendingPurchaseOrdersReport,
  pendingPurchaseOrdersReport,
} from "./test-support/pending-purchase-orders-report-fixtures";

test("has a Resumen sheet with the period and the figures the screen shows", () => {
  const [summary] = pendingPurchaseOrdersReportSpreadsheet(pendingPurchaseOrdersReport).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-05")],
      [cell.text("Hasta"), cell.day("2026-11-04")],
      [cell.text("Pedidos pendientes"), cell.count(3)],
      [cell.text("Proveedores"), cell.count(2)],
      [cell.text("Importe esperado"), cell.money(755_050)],
      [cell.text("Hay líneas sin precio de lista"), cell.text("Sí")],
    ],
  });
});

test("has a sheet named after the table with a row for each order, in the order the screen lists them", () => {
  const sheets = pendingPurchaseOrdersReportSpreadsheet(pendingPurchaseOrdersReport).sheets;

  expect(sheets[1]).toEqual({
    name: "Pedidos pendientes de recibir",
    header: [
      "Proveedor",
      "Enviado el",
      "Estado",
      "Productos",
      "Importe esperado",
      "Hay líneas sin precio de lista",
    ],
    rows: [
      [
        cell.text("Distribuidora Andina"),
        cell.instant("2026-10-08T01:30:00.000Z", "America/Argentina/Buenos_Aires"),
        cell.text("Enviado"),
        cell.count(2),
        cell.money(555_000),
        cell.text("Sí"),
      ],
      [
        cell.text("Granos del Sur"),
        cell.instant("2026-10-20T15:00:00.000Z", "America/Argentina/Buenos_Aires"),
        cell.text("Recibido en parte"),
        cell.count(1_200),
        cell.money(120_050),
        cell.text("No"),
      ],
      [
        cell.text("Distribuidora Andina"),
        cell.instant("2026-10-27T12:00:00.000Z", "America/Argentina/Buenos_Aires"),
        cell.text("Enviado"),
        cell.count(3),
        cell.money(80_000),
        cell.text("No"),
      ],
    ],
  });
});

test("has no rows in the table sheet and no unpriced warning when there are no orders", () => {
  const [summary, table] = pendingPurchaseOrdersReportSpreadsheet(
    emptyPendingPurchaseOrdersReport,
  ).sheets;

  expect(table?.rows).toEqual([]);
  expect(summary?.rows.at(-1)).toEqual([
    cell.text("Hay líneas sin precio de lista"),
    cell.text("No"),
  ]);
});
