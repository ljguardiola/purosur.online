import { expect, test } from "vitest";
import { cell } from "../platform/spreadsheet/workbook";
import { salesByPaymentMethodSpreadsheet } from "./sales-by-payment-method-spreadsheet";
import { todayPaymentsReport, weekPaymentsReport } from "./test-support/payments-report-fixtures";

test("has a Resumen sheet with the period, the register and the figures the screen shows", () => {
  const [summary] = salesByPaymentMethodSpreadsheet(
    weekPaymentsReport,
    weekPaymentsReport.methods,
    "Caja del fondo",
  ).sheets;

  expect(summary).toEqual({
    name: "Resumen",
    header: ["Dato", "Valor"],
    rows: [
      [cell.text("Desde"), cell.day("2026-10-01")],
      [cell.text("Hasta"), cell.day("2026-10-07")],
      [cell.text("Caja"), cell.text("Caja del fondo")],
      [cell.text("Total vendido"), cell.money(1_400_000)],
      [cell.text("Ventas"), cell.count(6)],
      [cell.text("Ticket promedio"), cell.money(233_333)],
    ],
  });
});

test("has a sheet named after the table with each method's figures and share in the given order", () => {
  const sheets = salesByPaymentMethodSpreadsheet(
    weekPaymentsReport,
    [...weekPaymentsReport.methods].reverse(),
    "Todas",
  ).sheets;

  expect(sheets[1]).toEqual({
    name: "Ventas por medio de pago",
    header: ["Medio de pago", "Ventas", "Importe", "Parte del total"],
    rows: [
      [
        cell.text("QR de Mercado Pago"),
        cell.count(3),
        cell.money(300_000),
        cell.percent((300_000 / 1_400_000) * 100),
      ],
      [
        cell.text("Point integrada"),
        cell.count(2),
        cell.money(150_000),
        cell.percent((150_000 / 1_400_000) * 100),
      ],
      [
        cell.text("Efectivo"),
        cell.count(4),
        cell.money(900_000),
        cell.percent((900_000 / 1_400_000) * 100),
      ],
      [
        cell.text("Transferencia"),
        cell.count(1),
        cell.money(50_000),
        cell.percent((50_000 / 1_400_000) * 100),
      ],
    ],
  });
});

test("leaves the average ticket empty and the table without rows when there are no sales", () => {
  const sheets = salesByPaymentMethodSpreadsheet(todayPaymentsReport, [], "Todas").sheets;

  expect(sheets[0]?.rows.slice(-1)).toEqual([[cell.text("Ticket promedio"), cell.empty()]]);
  expect(sheets[1]?.rows).toEqual([]);
});
