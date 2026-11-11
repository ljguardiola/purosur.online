import type { CashChargeAmounts } from "@purosur/contracts";
import { amountToChargeInCash, changeDiscountOption, quickCashAmounts } from "@purosur/domain";
import {
  currentSaleFor,
  previewSaleDiscountFor,
  type SaleRequestDeps,
} from "../sales/sale-requests";

export interface CashChargeAmountsRequest {
  saleId: string;
  saleDiscount?: number | undefined;
}

type CashChargeAmountsDeps = Pick<
  SaleRequestDeps,
  "database" | "gate" | "now" | "zoneRules" | "restoration"
>;

async function amountDueOf(
  deps: CashChargeAmountsDeps,
  { saleId, saleDiscount }: CashChargeAmountsRequest,
): Promise<number | null> {
  const sale = await currentSaleFor(deps);
  if (sale === null || sale === "not_permitted" || sale.id !== saleId) {
    return null;
  }
  if (saleDiscount === undefined) {
    return sale.pending;
  }
  const preview = await previewSaleDiscountFor(deps, {
    discount: { kind: "AMOUNT", value: saleDiscount },
  });
  return preview.kind === "preview" ? preview.total : null;
}

export async function cashChargeAmountsFor(
  deps: CashChargeAmountsDeps,
  request: CashChargeAmountsRequest,
): Promise<CashChargeAmounts | null> {
  const amountDue = await amountDueOf(deps, request);
  if (amountDue === null) {
    return null;
  }
  const amountToCharge = amountToChargeInCash(amountDue);
  return {
    amount_to_charge: amountToCharge,
    cash_rounding: amountDue - amountToCharge,
    quick_amounts: quickCashAmounts(amountDue),
    change_discount_option: changeDiscountOption(amountDue),
  };
}
