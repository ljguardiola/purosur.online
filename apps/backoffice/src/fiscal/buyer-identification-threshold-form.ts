import type { CalendarDate } from "@internationalized/date";
import {
  type BuyerIdentificationThresholdRecordBody,
  buyerIdentificationThresholdRecordBodySchema,
} from "@purosur/contracts";
import { parseAmountCents } from "@purosur/domain";
import { formatDisplayDate } from "./display-date";

export type ThresholdFormValues = { amount: string; validFrom: CalendarDate | null };

export const EMPTY_THRESHOLD_FORM: ThresholdFormValues = { amount: "", validFrom: null };

export function thresholdRequestFrom({
  amount,
  validFrom,
}: ThresholdFormValues): BuyerIdentificationThresholdRecordBody {
  return {
    amount: parseAmountCents(amount) ?? Number.NaN,
    valid_from: validFrom?.toString() ?? "",
  };
}

export function amountMessage({ amount }: ThresholdFormValues): string {
  if (amount.trim() === "") {
    return "Ingresá el importe del umbral.";
  }
  const cents = parseAmountCents(amount);
  if (cents === undefined) {
    return "Escribí el importe con coma para los decimales, por ejemplo 7.500,50.";
  }
  return buyerIdentificationThresholdRecordBodySchema.shape.amount.safeParse(cents).success
    ? "Revisá el importe."
    : "Ingresá un importe mayor a cero.";
}

export function validFromMessage({ validFrom }: ThresholdFormValues): string {
  return validFrom === null ? "Elegí desde cuándo rige el umbral." : "Revisá la fecha.";
}

export function notAfterLatestMessage(latestValidFrom: string): string {
  return `Tiene que ser posterior al ${formatDisplayDate(latestValidFrom)}, el inicio del último umbral cargado.`;
}
