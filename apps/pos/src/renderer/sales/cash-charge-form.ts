import { chargeSaleInCashMessageSchema } from "@purosur/contracts";
import { parseAmountCents } from "@purosur/ui";

export const chargeSaleInCashRequestSchema = chargeSaleInCashMessageSchema.pick({ tendered: true });

export const INVALID_AMOUNT_MESSAGE = "Ingresá un importe válido, por ejemplo 5.000,00.";

export type CashChargeFormValues = { tendered: string };

export const EMPTY_CASH_CHARGE_FORM: CashChargeFormValues = { tendered: "" };

export function cashChargeRequestFrom({ tendered }: CashChargeFormValues): { tendered: number } {
  return { tendered: parseAmountCents(tendered) ?? Number.NaN };
}
