import type { DiscountBenefit, DiscountStatus } from "@purosur/domain";
import { formatDate, type Tone } from "@purosur/ui";

export const DISCOUNT_KIND_LABELS = {
  PERCENT_OFF: "Porcentaje",
  BUY_N_PAY_M: "Lleve N, pague M",
} satisfies Record<DiscountBenefit["kind"], string>;

export const DISCOUNT_STATUS_PRESENTATION = {
  current: { label: "Vigente", tone: "success" },
  scheduled: { label: "Programada", tone: "info" },
  ended: { label: "Terminada", tone: "neutral" },
  deactivated: { label: "Desactivada", tone: "neutral" },
} satisfies Record<DiscountStatus, { label: string; tone: Tone }>;

function formatCalendarDay(day: string): string {
  return formatDate(Date.parse(day), {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const TRAILING_YEAR = /\/\d{4}$/;

export function discountValidityText(validFrom: string, validTo: string): string {
  const start = formatCalendarDay(validFrom);
  const sameYear = validFrom.slice(0, 4) === validTo.slice(0, 4);
  return `${sameYear ? start.replace(TRAILING_YEAR, "") : start} → ${formatCalendarDay(validTo)}`;
}
