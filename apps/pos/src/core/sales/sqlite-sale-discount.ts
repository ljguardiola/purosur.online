import type { SaleDiscount } from "@purosur/domain";

export interface SaleDiscountColumns {
  sale_discount_kind: SaleDiscount["kind"] | null;
  sale_discount_value: number | null;
  sale_discount_reason: string | null;
  sale_discount_authorized_by: string | null;
}

export function saleDiscountColumns(discount: SaleDiscount | null): SaleDiscountColumns {
  if (discount === null) {
    return {
      sale_discount_kind: null,
      sale_discount_value: null,
      sale_discount_reason: null,
      sale_discount_authorized_by: null,
    };
  }
  return {
    sale_discount_kind: discount.kind,
    sale_discount_value: discount.kind === "PERCENT" ? discount.percent : discount.amount,
    sale_discount_reason: discount.reason,
    sale_discount_authorized_by: discount.authorizedBy,
  };
}

export function toSaleDiscount(columns: SaleDiscountColumns): SaleDiscount | null {
  const {
    sale_discount_kind: kind,
    sale_discount_value: value,
    sale_discount_reason: reason,
    sale_discount_authorized_by: authorizedBy,
  } = columns;
  if (kind === null || value === null || reason === null) {
    return null;
  }
  return kind === "PERCENT"
    ? { kind, percent: value, reason, authorizedBy }
    : { kind, amount: value, reason, authorizedBy };
}
