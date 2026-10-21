import type { SupplierPriceListRowPriceBody } from "@purosur/contracts";
import { formatAmountInput, parseAmountCents } from "@purosur/ui";

export type RowPriceFormValues = { price: string; version: number };

export const EMPTY_ROW_PRICE_FORM: RowPriceFormValues = { price: "", version: 1 };

export const ROW_PRICE_FIELDS = { priceCents: "price", version: null } as const;

export function rowPriceFormValuesOf(
  priceCents: number | null,
  version: number,
): RowPriceFormValues {
  return { price: priceCents === null ? "" : formatAmountInput(priceCents), version };
}

export function rowPriceRequestFrom({
  price,
  version,
}: RowPriceFormValues): SupplierPriceListRowPriceBody {
  return { priceCents: parseAmountCents(price) ?? Number.NaN, version };
}

function rowPriceMessage({ price }: RowPriceFormValues): string {
  return price.trim() === ""
    ? "Ingresá el precio del ítem."
    : "Ingresá un precio válido, como 1.234,50.";
}

export const ROW_PRICE_FIELD_MESSAGES = { price: rowPriceMessage };
