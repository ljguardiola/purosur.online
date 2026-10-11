import type { ManualAdjustmentRequest } from "@purosur/contracts";
import { adjustSaleLineMessageSchema } from "@purosur/contracts";
import { parseAmountCents, parseEsArNumber } from "@purosur/ui";

export const adjustLineFormRequestSchema = adjustSaleLineMessageSchema.pick({
  adjustment: true,
  reason: true,
});

export type AdjustmentKind = ManualAdjustmentRequest["kind"];

export type AdjustLineFormValues = { kind: AdjustmentKind; value: string; reason: string };

export const EMPTY_ADJUST_LINE_FORM: AdjustLineFormValues = {
  kind: "PERCENT",
  value: "",
  reason: "",
};

export const REQUIRED_REASON_MESSAGE = "Escribí un motivo.";

function parsedValue(kind: AdjustmentKind, value: string): number {
  if (kind === "PERCENT") {
    const digits = parseEsArNumber(value, 0);
    return digits === undefined ? Number.NaN : Number(digits.whole);
  }
  return parseAmountCents(value) ?? Number.NaN;
}

export function adjustLineRequestFrom({ kind, value, reason }: AdjustLineFormValues): {
  adjustment: { kind: AdjustmentKind; value: number };
  reason: string;
} {
  return { adjustment: { kind, value: parsedValue(kind, value) }, reason };
}

export function previewAdjustmentFrom({
  kind,
  value,
}: Pick<AdjustLineFormValues, "kind" | "value">): ManualAdjustmentRequest | undefined {
  const parsed = adjustLineFormRequestSchema.shape.adjustment.safeParse(
    adjustLineRequestFrom({ kind, value, reason: "" }).adjustment,
  );
  return parsed.success ? parsed.data : undefined;
}

export function adjustLineValueMessage(kind: AdjustmentKind): string {
  switch (kind) {
    case "PRICE":
      return "Ingresá un precio válido, por ejemplo 1.500,00.";
    case "AMOUNT":
      return "Ingresá un descuento mayor a 0, por ejemplo 500,00.";
    case "PERCENT":
      return "Ingresá un porcentaje entero, por ejemplo 10.";
  }
}
