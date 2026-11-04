import type { ProductBrandAndNetContent, SaleUnit } from "../../catalog/index.js";
import { compareCodeUnits, compareSpanishText } from "../../shared/index.js";
import { hasReceiptDifference } from "./purchase-order-receipt.js";
import { reportMonthOf } from "./report-month.js";

export interface ReceiptDifferenceProduct extends ProductBrandAndNetContent {
  id: string;
  name: string;
  saleUnit: SaleUnit;
}

export interface ReceiptLineRow {
  receiptId: string;
  orderId: string;
  supplierId: string;
  supplierName: string;
  receivedOn: string;
  receivedAt: Date;
  product: ReceiptDifferenceProduct;
  receivedQuantity: number;
  missingQuantity: number;
  priceDifferenceCents: number | null;
}

interface ReceiptDifferenceLine {
  receiptId: string;
  orderId: string;
  receivedOn: string;
  receivedAt: Date;
  product: ReceiptDifferenceProduct;
  receivedQuantity: number;
  missingQuantity: number;
  priceDifferenceCents: number | null;
}

interface Differences {
  shortLines: number;
  priceDifferenceLines: number;
  priceDifferenceCents: number;
}

interface MonthDifferences extends Differences {
  month: string;
  lines: ReceiptDifferenceLine[];
}

interface SupplierDifferences extends Differences {
  supplierId: string;
  name: string;
  months: MonthDifferences[];
}

export interface ReceiptDifferences {
  suppliers: SupplierDifferences[];
  totals: Differences & { suppliers: number };
}

function differencesOf(lines: readonly ReceiptDifferenceLine[]): Differences {
  return {
    shortLines: lines.filter(({ missingQuantity }) => missingQuantity > 0).length,
    priceDifferenceLines: lines.filter(
      ({ priceDifferenceCents }) => priceDifferenceCents !== null && priceDifferenceCents !== 0,
    ).length,
    priceDifferenceCents: lines.reduce((sum, line) => sum + (line.priceDifferenceCents ?? 0), 0),
  };
}

function compareLines(a: ReceiptDifferenceLine, b: ReceiptDifferenceLine): number {
  return (
    a.receivedAt.getTime() - b.receivedAt.getTime() ||
    compareCodeUnits(a.receiptId, b.receiptId) ||
    compareCodeUnits(a.product.id, b.product.id)
  );
}

export function receiptDifferences(rows: readonly ReceiptLineRow[]): ReceiptDifferences {
  const bySupplier = new Map<string, { name: string; lines: ReceiptDifferenceLine[] }>();
  for (const row of rows.filter(hasReceiptDifference)) {
    const { supplierId, supplierName, ...line } = row;
    const supplier = bySupplier.get(supplierId) ?? { name: supplierName, lines: [] };
    supplier.lines.push(line);
    bySupplier.set(supplierId, supplier);
  }
  const suppliers = [...bySupplier.entries()]
    .map(([supplierId, { name, lines }]) => {
      const byMonth = new Map<string, ReceiptDifferenceLine[]>();
      for (const line of lines) {
        const month = reportMonthOf(line.receivedOn);
        byMonth.set(month, [...(byMonth.get(month) ?? []), line]);
      }
      return {
        supplierId,
        name,
        ...differencesOf(lines),
        months: [...byMonth.entries()]
          .sort(([a], [b]) => compareCodeUnits(a, b))
          .map(([month, monthLines]) => ({
            month,
            ...differencesOf(monthLines),
            lines: monthLines.sort(compareLines),
          })),
      };
    })
    .sort(
      (a, b) => compareSpanishText(a.name, b.name) || compareCodeUnits(a.supplierId, b.supplierId),
    );
  return {
    suppliers,
    totals: {
      suppliers: suppliers.length,
      ...differencesOf(suppliers.flatMap(({ months }) => months.flatMap(({ lines }) => lines))),
    },
  };
}
