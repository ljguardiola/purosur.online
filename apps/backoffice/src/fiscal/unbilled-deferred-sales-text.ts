import type { UnbilledDeferredSales } from "@purosur/contracts";
import { formatNumber, plural } from "@purosur/ui";

function ageText(ageDays: number): string {
  return ageDays === 0
    ? "hoy"
    : plural(ageDays, { one: "hace 1 día", other: `hace ${formatNumber(ageDays)} días` });
}

export function unbilledDeferredSalesText({ count, oldest }: UnbilledDeferredSales): string {
  const sales = plural(count, {
    one: "1 venta diferida sin facturar",
    other: `${formatNumber(count)} ventas diferidas sin facturar`,
  });
  if (oldest === null) {
    return sales;
  }
  return `${sales} · ${count === 1 ? "de" : "la más vieja de"} ${ageText(oldest.age_days)}`;
}
