import { chargeSaleByTransferMessageSchema } from "@purosur/contracts";
import { parseAmountCents } from "@purosur/ui";

export const chargeSaleByTransferRequestSchema = chargeSaleByTransferMessageSchema.pick({
  amount: true,
});

export type HandChargeFormValues = { amount: string };

export function handChargeRequestFrom({ amount }: HandChargeFormValues): {
  amount: number;
} {
  return { amount: parseAmountCents(amount) ?? Number.NaN };
}
