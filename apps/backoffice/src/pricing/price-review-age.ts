import type { PriceProduct } from "@purosur/contracts";
import { plural } from "@purosur/ui";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function calendarDaysSince(at: string, now: Date): number {
  return Math.round((startOfLocalDay(now) - startOfLocalDay(new Date(at))) / DAY_MS);
}

export function reviewedCellText(lastReviewedAt: string | null, now: Date): string {
  if (!lastReviewedAt) {
    return "Nunca";
  }
  const days = calendarDaysSince(lastReviewedAt, now);
  return days <= 0 ? "Hoy" : plural(days, { one: "Hace 1 día", other: `Hace ${days} días` });
}

function eyebrowOverdue(days: number): string {
  return plural(days, { one: "Sin revisar hace 1 día", other: `Sin revisar hace ${days} días` });
}

function eyebrowRecent(days: number): string {
  return plural(days, { one: "Revisado hace 1 día", other: `Revisado hace ${days} días` });
}

export function modalEyebrow(product: PriceProduct, now: Date): string {
  if (!product.currentPrice || !product.lastReviewedAt) {
    return "Sin precio";
  }
  const days = calendarDaysSince(product.lastReviewedAt, now);
  if (days <= 0) {
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
