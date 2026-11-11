import type { OpeningFloatSuggestion } from "@purosur/contracts";
import { openCashSessionMessageSchema } from "@purosur/contracts";
import { formatAmountInput, parseAmountCents } from "@purosur/ui";

const REQUIRED_MESSAGE = "Ingresá el fondo inicial.";
export const openCashSessionRequestSchema = openCashSessionMessageSchema.omit({
  type: true,
  request_id: true,
});

export const INVALID_OPENING_FLOAT_MESSAGE = "Ingresá un importe válido, por ejemplo 20.000,00.";

export type OpeningFloatFormValues = { openingFloat: string };

export function openingFloatFormFor(suggestion: OpeningFloatSuggestion): OpeningFloatFormValues {
  return {
    openingFloat:
      suggestion.kind === "previous_close" ? formatAmountInput(suggestion.counted_cash) : "",
  };
}

export function openingFloatRequestFrom({ openingFloat }: OpeningFloatFormValues): {
  opening_float: number;
} {
  return { opening_float: parseAmountCents(openingFloat) ?? Number.NaN };
}

export function openingFloatMessage({ openingFloat }: OpeningFloatFormValues): string {
  return openingFloat.trim() === "" ? REQUIRED_MESSAGE : INVALID_OPENING_FLOAT_MESSAGE;
}
