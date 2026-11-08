import type { StockBalance, StockBalanceList } from "@purosur/contracts";
import { formatProductDescription } from "@purosur/ui/formatters";
import { type Cell, cell, type Workbook } from "../platform/spreadsheet/workbook";
import { stockQuantityCells } from "../platform/stock-quantity-cells";
import { summarySheet } from "../shell/report-summary-sheet";

function orEmptyMoney(cents: number | null): Cell {
  return cents === null ? cell.empty() : cell.money(cents);
}

export function stockBalancesSpreadsheet(
  summary: StockBalanceList["summary"],
  products: readonly StockBalance[],
): Workbook {
  return {
    sheets: [
      summarySheet([
        ["Valorizado a costo", cell.money(summary.valueCents)],
        ["Productos", cell.count(summary.productCount)],
        ["Sin costo", cell.count(summary.withoutCostCount)],
      ]),
      {
        name: "Saldos",
        header: [
          "Producto",
          "Categoría",
          "Lotes",
          "Saldo (u)",
          "Saldo (kg)",
          "Costo unitario",
          "Valorizado",
        ],
        rows: products.map((product): Cell[] => [
          cell.text(formatProductDescription(product)),
          cell.text(product.categoryName),
          cell.count(product.lotCount),
          ...stockQuantityCells(product.balance, product.saleUnit),
          orEmptyMoney(product.unitCostCents),
          orEmptyMoney(product.valueCents),
        ]),
      },
      {
        name: "Lotes",
        header: [
          "Producto",
          "Categoría",
          "Lote",
          "Vencimiento",
          "Saldo (u)",
          "Saldo (kg)",
          "Costo unitario",
          "Valorizado",
        ],
        rows: products.flatMap((product) =>
          product.lots.map((lot): Cell[] => [
            cell.text(formatProductDescription(product)),
            cell.text(product.categoryName),
            cell.text(lot.lotName),
            lot.expiresOn === null ? cell.empty() : cell.day(lot.expiresOn),
            ...stockQuantityCells(lot.remaining, product.saleUnit),
            orEmptyMoney(lot.unitCostCents),
            orEmptyMoney(lot.valueCents),
          ]),
        ),
      },
    ],
  };
}
