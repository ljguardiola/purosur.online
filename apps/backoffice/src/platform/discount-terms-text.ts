import type { DiscountBenefit, DiscountTargetKind } from "@purosur/domain";
import { formatNumber } from "@purosur/ui";

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
  switch (benefit.kind) {
    case "PERCENT_OFF":
      return `${formatNumber(benefit.percent)} % de descuento`;
    case "BUY_N_PAY_M":
      return `Lleve ${formatNumber(benefit.buyQty)}, pague ${formatNumber(benefit.payQty)}`;
  }
}

export function discountTargetLine(target: { kind: DiscountTargetKind; name: string }): string {
  return `${DISCOUNT_TARGET_KIND_LABELS[target.kind]} · ${target.name}`;
}

export function weekdaysText(weekdays: readonly number[]): string {
  if (weekdays.length === 0 || weekdays.length === WEEKDAY_NAMES.length) {
    return "Todos los días";
  }
  const names = WEEKDAY_NAMES.filter((_, index) => weekdays.includes(index + 1));
  const text = weekdayList.format(names);
  return text.charAt(0).toLocaleUpperCase("es-AR") + text.slice(1);
}
