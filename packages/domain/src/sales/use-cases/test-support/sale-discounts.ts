import type { SaleDiscount } from "../../model/sale-discount.js";

export const TEN_PERCENT_SALE_DISCOUNT: SaleDiscount = {
  kind: "PERCENT",
  percent: 10,
  reason: "cliente frecuente",
  authorizedBy: "supervisor",
};
