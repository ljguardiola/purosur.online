import { addWeighedProductMessageSchema, changeLineWeightMessageSchema } from "@purosur/contracts";
import { parseWeightThousandths } from "@purosur/ui";

export const addWeighedProductRequestSchema = addWeighedProductMessageSchema.pick({
  weight_thousandths: true,
});

export const changeLineWeightRequestSchema = changeLineWeightMessageSchema.pick({
  weight_thousandths: true,
});

export type WeightFormValues = { weight: string };

export const EMPTY_WEIGHT_FORM: WeightFormValues = { weight: "" };

export function weightRequestFrom({ weight }: WeightFormValues): { weight_thousandths: number } {
  return { weight_thousandths: parseWeightThousandths(weight) ?? Number.NaN };
}

type WeightRequestSchema =
  | typeof addWeighedProductRequestSchema
  | typeof changeLineWeightRequestSchema;

export function weightMessage(schema: WeightRequestSchema, values: WeightFormValues): string {
  const request = weightRequestFrom(values);
  return request.weight_thousandths > 0 && !schema.safeParse(request).success
    ? "El peso supera el máximo de una línea."
    : "Ingresá un peso mayor a 0 kg, con hasta 3 decimales.";
}
