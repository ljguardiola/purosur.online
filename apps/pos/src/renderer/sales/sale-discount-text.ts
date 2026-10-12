import type { OpenSale } from "@purosur/contracts";
import { formatNumber } from "@purosur/ui";

type SaleDiscount = NonNullable<OpenSale["sale_discount"]>;

const SALE_DISCOUNT_LABEL = "Descuento sobre el total";

export function saleDiscountLabel(discount: SaleDiscount): string {
  return discount.kind === "PERCENT"
    ? `${SALE_DISCOUNT_LABEL} · ${formatNumber(discount.value)} %`
    : SALE_DISCOUNT_LABEL;
}
