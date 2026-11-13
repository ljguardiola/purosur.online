import type { ConsultProductOutcome } from "@purosur/contracts";
import { formatPercent, formatRecurringWeekdays } from "@purosur/ui";
import { linePromotionText } from "./line-promotion-text";

type ConsultedPromotion = NonNullable<
  Extract<ConsultProductOutcome, { kind: "consulted" }>["promotion"]
>;

export function consultedPromotionText({
  benefit,
  weekdays,
}: {
  benefit: ConsultedPromotion["benefit"];
  weekdays: readonly number[];
}): string {
  if (weekdays.length === 0) {
    return linePromotionText(benefit);
  }
  const offer =
    benefit.kind === "PERCENT_OFF" ? formatPercent(benefit.percent) : linePromotionText(benefit);
  return `${offer} ${formatRecurringWeekdays(weekdays)}`;
}
