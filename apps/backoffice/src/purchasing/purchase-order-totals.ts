import type { PurchaseOrderDetail } from "@purosur/contracts";

type OrderLine = PurchaseOrderDetail["lines"][number];

export function lineTotalCents(line: OrderLine): number | null {
  return line.expectedPackagePriceCents === null
    ? null
    : line.packages * line.expectedPackagePriceCents;
}

export function orderTotalOf(lines: readonly OrderLine[]): {
  cents: number;
  hasUnpricedLine: boolean;
} {
  let cents = 0;
  let hasUnpricedLine = false;
  for (const line of lines) {
    const total = lineTotalCents(line);
    if (total === null) {
      hasUnpricedLine = true;
    } else {
      cents += total;
    }
  }
  return { cents, hasUnpricedLine };
}
