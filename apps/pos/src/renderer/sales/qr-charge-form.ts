import { startMercadoPagoQrChargeMessageSchema } from "@purosur/contracts";
import { parseAmountCents } from "@purosur/ui";

export const startQrChargeRequestSchema = startMercadoPagoQrChargeMessageSchema.pick({
  amount: true,
});

export type QrChargeFormValues = { amount: string };

export function qrChargeRequestFrom({ amount }: QrChargeFormValues): { amount: number } {
  return { amount: parseAmountCents(amount) ?? Number.NaN };
}
