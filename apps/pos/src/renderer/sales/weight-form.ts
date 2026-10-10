import { saleLineWeightSchema } from "@purosur/contracts";
import { formatNumber, parseWeightThousandths } from "@purosur/ui";
import { z } from "zod";

export const weightRequestSchema = z.object({ weight_thousandths: saleLineWeightSchema });

export const INVALID_WEIGHT_MESSAGE = "Ingresá un peso mayor a 0 kg, con hasta 3 decimales.";

export type WeightFormValues = { weight: string };

export const EMPTY_WEIGHT_FORM: WeightFormValues = { weight: "" };

export function weightRequestFrom({ weight }: WeightFormValues): { weight_thousandths: number } {
  return { weight_thousandths: parseWeightThousandths(weight) ?? Number.NaN };
}

export function weightFieldText(thousandths: number): string {
  return formatNumber(thousandths / 1000, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}
