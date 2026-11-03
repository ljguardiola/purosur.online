import {
  chargeSaleInCashMessageSchema,
  chargeSaleInCashWithChangeDiscountMessageSchema,
} from "@purosur/contracts";
import { parseAmountCents } from "@purosur/ui";

export const chargeSaleInCashRequestSchema = chargeSaleInCashMessageSchema
  .pick({ tendered: true })
  .extend({
    discount_amount:
      chargeSaleInCashWithChangeDiscountMessageSchema.shape.discount_amount.optional(),
  });

export const INVALID_AMOUNT_MESSAGE = "Ingresá un importe válido, por ejemplo 5.000,00.";

export type CashChargeFormValues = { tendered: string; discount: string };

export const EMPTY_CASH_CHARGE_FORM: CashChargeFormValues = { tendered: "", discount: "" };

export function cashChargeRequestFrom({ tendered, discount }: CashChargeFormValues): {
  tendered: number;
  discount_amount?: number;
} {
  return {
    tendered: parseAmountCents(tendered) ?? Number.NaN,
    ...(discount.trim() === ""
      ? {}
      : { discount_amount: parseAmountCents(discount) ?? Number.NaN }),
  };
}

export function typedChangeDiscount(discount: string): number | undefined {
  const parsed = chargeSaleInCashRequestSchema.shape.discount_amount.safeParse(
    cashChargeRequestFrom({ tendered: "", discount }).discount_amount,
  );
  return parsed.success ? parsed.data : undefined;
}
