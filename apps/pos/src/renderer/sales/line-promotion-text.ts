import type { OpenSale } from "@purosur/contracts";
import { formatNumber } from "@purosur/ui";

type LinePromotion = NonNullable<OpenSale["lines"][number]["promotion"]>;

export function linePromotionText(promotion: LinePromotion): string {
  switch (promotion.kind) {
    case "PERCENT_OFF":
      return `${formatNumber(promotion.percent)} % de descuento`;
    case "BUY_N_PAY_M":
      return `Lleve ${formatNumber(promotion.buy_qty)}, pague ${formatNumber(promotion.pay_qty)}`;
  }
}
