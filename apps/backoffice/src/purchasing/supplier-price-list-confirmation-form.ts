import { type CalendarDate, parseDate } from "@internationalized/date";
import type { SupplierPriceListConfirmationBody } from "@purosur/contracts";

export type ConfirmationFormValues = { date: CalendarDate | null; version: number };

export const CONFIRMATION_FIELDS = { listDate: "date", version: null } as const;

export function confirmationFormValuesOf(
  listDate: string | null,
  version: number,
): ConfirmationFormValues {
  return { date: listDate === null ? null : parseDate(listDate), version };
}

export function confirmationRequestFrom({
  date,
  version,
}: ConfirmationFormValues): SupplierPriceListConfirmationBody {
  return { listDate: date?.toString() ?? null, version };
}

function confirmationDateMessage(_values: ConfirmationFormValues): string {
  return "Ingresá la fecha de la lista.";
}

export const CONFIRMATION_FIELD_MESSAGES = { date: confirmationDateMessage };
