import { recordCashMovementMessageSchema } from "@purosur/contracts";
import type { CashMovementKind } from "@purosur/domain";
import { parseAmountCents } from "@purosur/ui";

export const recordCashMovementFormRequestSchema = recordCashMovementMessageSchema.omit({
  type: true,
  request_id: true,
  authorization: true,
});

const REQUIRED_AMOUNT_MESSAGE = "Ingresá el importe.";
export const INVALID_AMOUNT_MESSAGE = "Ingresá un importe válido, por ejemplo 5.000,00.";

export type CashMovementFormValues = { kind: CashMovementKind; amount: string; reason: string };

export const EMPTY_CASH_MOVEMENT_FORM: CashMovementFormValues = {
  kind: "CASH_IN",
  amount: "",
  reason: "",
};

export function cashMovementRequestFrom({ kind, amount, reason }: CashMovementFormValues): {
  kind: CashMovementKind;
  amount: number;
  reason: string;
} {
  return {
    kind,
    amount: parseAmountCents(amount) ?? Number.NaN,
    reason,
  };
}

export function amountMessage({ amount }: CashMovementFormValues): string {
  return amount.trim() === "" ? REQUIRED_AMOUNT_MESSAGE : INVALID_AMOUNT_MESSAGE;
}
