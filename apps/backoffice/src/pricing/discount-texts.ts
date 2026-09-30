import type { DiscountBenefit, DiscountStatus, DiscountTargetKind } from "@purosur/domain";
import { formatDate, formatNumber, type Tone } from "@purosur/ui";

export const DISCOUNT_KIND_LABELS = {
  PERCENT_OFF: "Porcentaje",
} satisfies Record<DiscountBenefit["kind"], string>;

export const DISCOUNT_STATUS_PRESENTATION = {
  current: { label: "Vigente", tone: "success" },
  scheduled: { label: "Programada", tone: "info" },
  ended: { label: "Terminada", tone: "neutral" },
  deactivated: { label: "Desactivada", tone: "neutral" },
} satisfies Record<DiscountStatus, { label: string; tone: Tone }>;

export const DISCOUNT_TARGET_KIND_LABELS = {
  PRODUCT: "Producto",
  CATEGORY: "Categoría",
  TAG: "Distintivo",
} satisfies Record<DiscountTargetKind, string>;

const WEEKDAY_NAMES = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
] as const;

const weekdayList = new Intl.ListFormat("es-AR", { style: "long", type: "conjunction" });

export function discountBenefitText(benefit: DiscountBenefit): string {
  return `${formatNumber(benefit.percent)} % de descuento`;
}

export function discountTargetLine(target: { kind: DiscountTargetKind; name: string }): string {
  return `${DISCOUNT_TARGET_KIND_LABELS[target.kind]} · ${target.name}`;
}

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

export function weekdaysText(weekdays: readonly number[]): string {
  if (weekdays.length === 0 || weekdays.length === WEEKDAY_NAMES.length) {
    return "Todos los días";
  }
  const names = WEEKDAY_NAMES.filter((_, index) => weekdays.includes(index + 1));
  const text = weekdayList.format(names);
  return text.charAt(0).toLocaleUpperCase("es-AR") + text.slice(1);
}
