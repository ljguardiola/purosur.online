import type { SalesByPromotionBody } from "@purosur/contracts";
import {
  discountBenefitText,
  discountTargetLine,
  weekdaysText,
} from "../platform/discount-terms-text";

type PromotionTerms = NonNullable<SalesByPromotionBody["rows"][number]["terms"]>;

const EVERY_WEEKDAY = 7;

export function promotionTermsText(terms: PromotionTerms | null): string | null {
  if (terms === null) {
    return null;
  }
  const weekdays =
    terms.weekdays.length === 0 || terms.weekdays.length === EVERY_WEEKDAY
      ? []
      : [weekdaysText(terms.weekdays)];
  return [discountTargetLine(terms.target), discountBenefitText(terms.benefit), ...weekdays].join(
    " · ",
  );
}
