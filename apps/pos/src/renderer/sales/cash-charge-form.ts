import { applySaleDiscountMessageSchema, chargeSaleInCashMessageSchema } from "@purosur/contracts";
import { parseAmountCents } from "@purosur/ui";

export const chargeSaleInCashRequestSchema = chargeSaleInCashMessageSchema
  .pick({ tendered: true })
  .extend({ discount: applySaleDiscountMessageSchema.shape.discount.optional() });

export const INVALID_AMOUNT_MESSAGE = "Ingresá un importe válido, por ejemplo 5.000,00.";

export type CashChargeFormValues = { tendered: string; discount: string };

export const EMPTY_CASH_CHARGE_FORM: CashChargeFormValues = { tendered: "", discount: "" };

export function cashChargeRequestFrom({ tendered, discount }: CashChargeFormValues): {
  tendered: number;
  discount?: { kind: "AMOUNT"; value: number };
} {
  return {
    tendered: parseAmountCents(tendered) ?? Number.NaN,
    ...(discount.trim() === ""
      ? {}
      : { discount: { kind: "AMOUNT", value: parseAmountCents(discount) ?? Number.NaN } }),
  };
}

export function typedChangeDiscount(
  discount: string,
): { kind: "AMOUNT"; value: number } | undefined {
  const parsed = chargeSaleInCashRequestSchema.shape.discount.safeParse(
    cashChargeRequestFrom({ tendered: "", discount }).discount,
  );
  return parsed.success && parsed.data?.kind === "AMOUNT" ? parsed.data : undefined;
}
