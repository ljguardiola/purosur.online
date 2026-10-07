import { chargeSaleByTransferMessageSchema } from "@purosur/contracts";
import { parseAmountCents } from "@purosur/ui";

export const chargeSaleByTransferRequestSchema = chargeSaleByTransferMessageSchema.pick({
  amount: true,
});

export type TransferChargeFormValues = { amount: string };

export function transferChargeRequestFrom({ amount }: TransferChargeFormValues): {
  amount: number;
} {
  return { amount: parseAmountCents(amount) ?? Number.NaN };
}
