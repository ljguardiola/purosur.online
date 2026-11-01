import type { PurchasesBySupplierBody } from "@purosur/contracts";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";

export function purchasesReportSpreadsheet(shown: PurchasesBySupplierBody): Workbook {
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Total comprado", cell.money(shown.totals.amount)],
        ["Compras", cell.count(shown.totals.purchases)],
        ["Proveedores", cell.count(shown.totals.suppliers)],
      ]),
      {
        name: "Compras por proveedor",
        header: ["Proveedor", "Mes", "Compras", "Importe"],
        rows: shown.suppliers.flatMap((supplier) =>
          supplier.months.map((month) => [
            cell.text(supplier.name),
            cell.month(month.month),
            cell.count(month.purchases),
            cell.money(month.amount),
          ]),
        ),
      },
      {
        name: "Totales por proveedor",
        header: ["Proveedor", "Compras", "Importe"],
        rows: shown.suppliers.map((supplier) => [
          cell.text(supplier.name),
          cell.count(supplier.purchases),
          cell.money(supplier.amount),
        ]),
      },
    ],
  };
}
