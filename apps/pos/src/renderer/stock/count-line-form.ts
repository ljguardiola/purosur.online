import { recordInitialCountLineMessageSchema } from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import type { DateFieldProps } from "@purosur/ui";
import { parseEsArNumber } from "@purosur/ui";

export type ExpiryDay = NonNullable<DateFieldProps["value"]>;

export type CountLineFormValues = { counted: string; expiresOn: ExpiryDay | null };

export const EMPTY_COUNT_LINE_FORM: CountLineFormValues = { counted: "", expiresOn: null };

export const countLineRequestSchema = recordInitialCountLineMessageSchema.pick({
  counted: true,
  expires_on: true,
});

export const EXPIRY_MESSAGE = "Elegí un vencimiento válido.";

const KG_DECIMALS = 3;
const THOUSANDTHS_PER_UNIT = 1000;

function countedThousandths(text: string, saleUnit: SaleUnit): number {
  const digits = parseEsArNumber(text, saleUnit === "KG" ? KG_DECIMALS : 0);
  if (digits === undefined) {
    return Number.NaN;
  }
  return (
    Number(digits.whole) * THOUSANDTHS_PER_UNIT + Number(digits.fraction.padEnd(KG_DECIMALS, "0"))
  );
}

export function countLineRequestFrom(saleUnit: SaleUnit) {
  return ({ counted, expiresOn }: CountLineFormValues) => ({
    counted: countedThousandths(counted, saleUnit),
    expires_on: expiresOn === null ? null : expiresOn.toString(),
  });
}

export function countedMessage(saleUnit: SaleUnit, values: CountLineFormValues): string {
  const { counted } = countLineRequestFrom(saleUnit)(values);
  if (counted > 0 && !countLineRequestSchema.shape.counted.safeParse(counted).success) {
    return "La cantidad supera el máximo de una línea.";
  }
  return saleUnit === "KG"
    ? "Ingresá un peso mayor a 0 kg, con hasta 3 decimales."
    : "Ingresá una cantidad entera de unidades, mayor a 0.";
}
