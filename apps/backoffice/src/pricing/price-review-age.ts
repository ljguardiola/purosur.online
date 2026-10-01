import type { PriceProduct } from "@purosur/contracts";
import { plural } from "@purosur/ui";

export function reviewedCellText(daysSinceReview: number | null): string {
  if (daysSinceReview === null) {
    return "Nunca";
  }
  return daysSinceReview === 0
    ? "Hoy"
    : plural(daysSinceReview, {
        one: "Hace 1 día",
        other: `Hace ${daysSinceReview} días`,
      });
}

function eyebrowOverdue(days: number): string {
  return plural(days, { one: "Sin revisar hace 1 día", other: `Sin revisar hace ${days} días` });
}

function eyebrowRecent(days: number): string {
  return plural(days, { one: "Revisado hace 1 día", other: `Revisado hace ${days} días` });
}

export function modalEyebrow(product: PriceProduct): string {
  const days = product.daysSinceReview;
  if (!product.currentPrice || days === null) {
    return "Sin precio";
  }
  if (days === 0) {
    return "Revisado hoy";
  }
  return product.pending ? eyebrowOverdue(days) : eyebrowRecent(days);
}

export function emptyPendingDetail(params: { days: number }): string {
  return plural(params.days, {
    one: "Todos los precios se revisaron en el último día.",
    other: `Todos los precios se revisaron en los últimos ${params.days} días.`,
  });
}
