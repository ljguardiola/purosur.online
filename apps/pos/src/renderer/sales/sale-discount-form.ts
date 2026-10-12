import type { SaleDiscountRequest } from "@purosur/contracts";
import { applySaleDiscountMessageSchema } from "@purosur/contracts";
import { parsedValue } from "./adjust-line-form";

export const saleDiscountFormRequestSchema = applySaleDiscountMessageSchema.pick({
  discount: true,
  reason: true,
});

export type SaleDiscountKind = SaleDiscountRequest["kind"];

export type SaleDiscountFormValues = { kind: SaleDiscountKind; value: string; reason: string };

export const EMPTY_SALE_DISCOUNT_FORM: SaleDiscountFormValues = {
  kind: "PERCENT",
  value: "",
  reason: "",
};

export function saleDiscountRequestFrom({ kind, value, reason }: SaleDiscountFormValues): {
  discount: { kind: SaleDiscountKind; value: number };
  reason: string;
} {
  return { discount: { kind, value: parsedValue(kind, value) }, reason };
}

export function previewSaleDiscountFrom({
  kind,
  value,
}: Pick<SaleDiscountFormValues, "kind" | "value">): SaleDiscountRequest | undefined {
  const parsed = saleDiscountFormRequestSchema.shape.discount.safeParse(
    saleDiscountRequestFrom({ kind, value, reason: "" }).discount,
  );
  return parsed.success ? parsed.data : undefined;
}

export function saleDiscountValueMessage(kind: SaleDiscountKind): string {
  switch (kind) {
    case "AMOUNT":
      return "Ingresá un descuento mayor a 0, por ejemplo 500,00.";
    case "PERCENT":
      return "Ingresá un porcentaje entero, por ejemplo 10.";
  }
}
