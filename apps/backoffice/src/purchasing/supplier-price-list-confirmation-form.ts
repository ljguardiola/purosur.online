import { type CalendarDate, parseDate } from "@internationalized/date";
import type { SupplierPriceListConfirmationBody } from "@purosur/contracts";

type PricesIncludeVatChoice = "included" | "excluded";

export type ConfirmationFormValues = {
  date: CalendarDate | null;
  pricesIncludeVat: PricesIncludeVatChoice | null;
  version: number;
};

export const CONFIRMATION_FIELDS = {
  listDate: "date",
  pricesIncludeVat: "pricesIncludeVat",
  version: null,
} as const;

export const PRICES_INCLUDE_VAT_OPTIONS = [
  { value: "included", label: "incluyen IVA" },
  { value: "excluded", label: "no incluyen IVA" },
] as const satisfies readonly { value: PricesIncludeVatChoice; label: string }[];

const VAT_CHOICES = { true: "included", false: "excluded" } as const;

export function confirmationFormValuesOf(
  listDate: string | null,
  pricesIncludeVat: boolean | null,
  version: number,
): ConfirmationFormValues {
  return {
    date: listDate === null ? null : parseDate(listDate),
    pricesIncludeVat: pricesIncludeVat === null ? null : VAT_CHOICES[`${pricesIncludeVat}`],
    version,
  };
}

export function confirmationRequestFrom({
  date,
  pricesIncludeVat,
  version,
}: ConfirmationFormValues): SupplierPriceListConfirmationBody {
  return {
    listDate: date?.toString() ?? null,
    pricesIncludeVat: pricesIncludeVat === null ? null : pricesIncludeVat === "included",
    version,
  };
}

function confirmationDateMessage(_values: ConfirmationFormValues): string {
  return "Ingresá la fecha de la lista.";
}

function confirmationVatMessage(_values: ConfirmationFormValues): string {
  return "Elegí si los precios incluyen IVA.";
}

export const CONFIRMATION_FIELD_MESSAGES = {
  date: confirmationDateMessage,
  pricesIncludeVat: confirmationVatMessage,
};
