import type { PriceProduct } from "@purosur/contracts";
import { formatTimeAgo, plural } from "@purosur/ui";

export function reviewedCellText(secondsSinceReview: number | null): string {
  return secondsSinceReview === null ? "Nunca" : formatTimeAgo(secondsSinceReview);
}

export function modalEyebrow(product: PriceProduct): string {
  const seconds = product.secondsSinceReview;
  if (!product.currentPrice || seconds === null) {
    return "Sin precio";
  }
  return `${product.pending ? "Sin revisar" : "Revisado"} ${formatTimeAgo(seconds)}`;
}

export function emptyPendingDetail(params: { days: number }): string {
  return plural(params.days, {
    one: "Todos los precios se revisaron en el último día.",
    other: `Todos los precios se revisaron en los últimos ${params.days} días.`,
  });
}
