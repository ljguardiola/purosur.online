import type { SaleDiscountRequest } from "@purosur/contracts";
import { applySaleDiscountMessageSchema } from "@purosur/contracts";
import { OTHER_REASON, parsedValue, reasonFrom } from "./adjust-line-form";

export const saleDiscountFormRequestSchema = applySaleDiscountMessageSchema.pick({
  discount: true,
  reason: true,
});

export type SaleDiscountKind = SaleDiscountRequest["kind"];

export const SALE_DISCOUNT_REASONS = ["Cortesía", OTHER_REASON] as const;

export type SaleDiscountFormValues = {
  kind: SaleDiscountKind;
  value: string;
  reasonOption: string;
  otherReason: string;
};

export const EMPTY_SALE_DISCOUNT_FORM: SaleDiscountFormValues = {
  kind: "PERCENT",
  value: "",
  reasonOption: "Cortesía",
  otherReason: "",
};

export function saleDiscountRequestFrom(values: SaleDiscountFormValues): {
  discount: { kind: SaleDiscountKind; value: number };
  reason: string;
} {
  return {
    discount: { kind: values.kind, value: parsedValue(values.kind, values.value) },
    reason: reasonFrom(values),
  };
}

export function previewSaleDiscountFrom({
  kind,
  value,
}: Pick<SaleDiscountFormValues, "kind" | "value">): SaleDiscountRequest | undefined {
  const parsed = saleDiscountFormRequestSchema.shape.discount.safeParse({
    kind,
    value: parsedValue(kind, value),
  });
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
