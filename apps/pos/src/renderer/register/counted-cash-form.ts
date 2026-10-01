import {
  closeCashSessionMessageSchema,
  closeLockedCashSessionMessageSchema,
} from "@purosur/contracts";
import { parseAmountCents } from "@purosur/ui";

export const countedCashRequestSchema = closeCashSessionMessageSchema.pick({ counted_cash: true });
export const lockedCountedCashRequestSchema = closeLockedCashSessionMessageSchema.pick({
  counted_cash: true,
});

type CountedCashRequestSchema =
  | typeof countedCashRequestSchema
  | typeof lockedCountedCashRequestSchema;

const REQUIRED_MESSAGE = "Ingresá el efectivo contado.";
export const INVALID_COUNTED_CASH_MESSAGE = "Ingresá un importe válido, por ejemplo 31.500,00.";

export type CountedCashFormValues = { countedCash: string };

export const EMPTY_COUNTED_CASH_FORM: CountedCashFormValues = { countedCash: "" };

export function countedCashRequestFrom({ countedCash }: CountedCashFormValues): {
  counted_cash: number;
} {
  return { counted_cash: parseAmountCents(countedCash) ?? Number.NaN };
}

export function countedCashMessage({ countedCash }: CountedCashFormValues): string {
  return countedCash.trim() === "" ? REQUIRED_MESSAGE : INVALID_COUNTED_CASH_MESSAGE;
}

export function countedCashOf(
  schema: CountedCashRequestSchema,
  values: CountedCashFormValues,
): number | undefined {
  const request = schema.safeParse(countedCashRequestFrom(values));
  return request.success ? request.data.counted_cash : undefined;
}
