import type { CurrentStockReportBody } from "@purosur/contracts";
import { formatProductDescription } from "@purosur/ui/formatters";
import { shareOfTotal } from "../platform/share-of-total";
import { type Cell, cell, type Workbook } from "../platform/spreadsheet/workbook";
import { summarySheet } from "../shell/report-summary-sheet";
import { stockQuantityCells } from "./stock-quantity-cells";

type Product = CurrentStockReportBody["products"][number];
type Lot = Product["lots"][number];

function productName(product: Product): string {
  return formatProductDescription({
    name: product.name,
    brandName: product.brand_name,
    netContent: product.net_content,
  });
}

function orEmptyMoney(cents: number | null): Cell {
  return cents === null ? cell.empty() : cell.money(cents);
}

function lotNumberCell(lot: Lot): Cell {
  if (lot.technical) {
    return cell.text("Técnico");
  }
  return lot.lot_number === null ? cell.empty() : cell.text(lot.lot_number);
}

function positiveValueTotal(products: readonly Product[]): number {
  return products.reduce((sum, { value_cents }) => sum + Math.max(value_cents ?? 0, 0), 0);
}

function shareCell(product: Product, total: number): Cell {
  const value = product.value_cents;
  return value === null || value <= 0
    ? cell.empty()
    : cell.percent(shareOfTotal(value, total) * 100);
}

export function currentStockReportSpreadsheet(
  shown: CurrentStockReportBody,
  products: readonly Product[],
  categoryLabel: string,
): Workbook {
  const total = positiveValueTotal(products);
  return {
    sheets: [
      summarySheet([
        ["Categoría", cell.text(categoryLabel)],
        ["Valorizado a costo", cell.money(shown.summary.value_cents)],
        ["Productos", cell.count(shown.summary.product_count)],
        ["Con saldo negativo", cell.count(shown.summary.negative_balance_count)],
        ["Sin costo", cell.count(shown.summary.without_cost_count)],
      ]),
      {
        name: "Stock actual valorizado",
        header: [
          "Producto",
          "Categoría",
          "Lotes",
          "Saldo (u)",
          "Saldo (kg)",
          "Valorizado",
          "Parte del total",
        ],
        rows: products.map((product): Cell[] => [
          cell.text(productName(product)),
          cell.text(product.category_name),
          cell.count(product.lots.length),
          ...stockQuantityCells(product.balance, product.sale_unit),
          orEmptyMoney(product.value_cents),
          shareCell(product, total),
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
            cell.text(productName(product)),
            cell.text(product.category_name),
            lotNumberCell(lot),
            lot.expires_on === null ? cell.empty() : cell.day(lot.expires_on),
            ...stockQuantityCells(lot.remaining, product.sale_unit),
            orEmptyMoney(lot.unit_cost_cents),
            orEmptyMoney(lot.value_cents),
          ]),
        ),
      },
    ],
  };
}
