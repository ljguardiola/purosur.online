import { startMercadoPagoChargeMessageSchema } from "@purosur/contracts";
import { parseAmountCents } from "@purosur/ui";

export const mercadoPagoChargeRequestSchema = startMercadoPagoChargeMessageSchema.pick({
  amount: true,
});

export type MercadoPagoChargeFormValues = { amount: string };

export function mercadoPagoChargeRequestFrom({ amount }: MercadoPagoChargeFormValues): {
  amount: number;
} {
  return { amount: parseAmountCents(amount) ?? Number.NaN };
}
