import { type CalendarDate, parseDate } from "@internationalized/date";
import {
  type FreightBody,
  type FreightSummary,
  freightBodySchema,
  freightListQuerySchema,
} from "@purosur/contracts";
import { parseAmountCents } from "@purosur/ui";
import { schemaLimit } from "../platform/schema-limit";
import type { FreightPeriod } from "./freights-api";

const { description: descriptionSchema, means: meansSchema } = freightBodySchema.shape;

const carrierNameSchema = meansSchema.options[0].shape.name;

export type FreightFormValues = {
  date: CalendarDate | null;
  amount: string;
  ownTrip: boolean;
  carrierName: string;
  description: string;
  purchaseIds: string[];
};

export const EMPTY_FREIGHT_FORM: FreightFormValues = {
  date: null,
  amount: "",
  ownTrip: false,
  carrierName: "",
  description: "",
  purchaseIds: [],
};

export const FREIGHT_FIELDS = {
  date: "date",
  amountCents: "amount",
  description: "description",
  means: "carrierName",
  purchaseIds: "purchaseIds",
} as const;

export function freightRequestFrom({
  date,
  amount,
  ownTrip,
  carrierName,
  description,
  purchaseIds,
}: FreightFormValues): FreightBody {
  return {
    date: date?.toString() ?? "",
    amountCents: parseAmountCents(amount) ?? Number.NaN,
    description: description.trim(),
    means: ownTrip ? { kind: "own_trip" } : { kind: "carrier", name: carrierName.trim() },
    purchaseIds,
  };
}

function amountOf(cents: number): string {
  const whole = Math.trunc(cents / 100);
  return `${whole},${String(cents % 100).padStart(2, "0")}`;
}

export function freightFormValuesOf(freight: FreightSummary): FreightFormValues {
  return {
    date: parseDate(freight.date),
    amount: amountOf(freight.amountCents),
    ownTrip: freight.means.kind === "own_trip",
    carrierName: freight.means.kind === "carrier" ? freight.means.name : "",
    description: freight.description,
    purchaseIds: freight.purchases.map((purchase) => purchase.id),
  };
}

function freightDateMessage({ date }: FreightFormValues): string {
  return date === null
    ? "Ingresá la fecha del flete."
    : "La fecha del flete no puede ser posterior a hoy.";
}

function freightAmountMessage({ amount }: FreightFormValues): string {
  const cents = parseAmountCents(amount);
  if (cents === undefined) {
    return "Escribí el monto con coma para los centavos, por ejemplo 1.250,50.";
  }
  return cents <= 0 ? "El monto tiene que ser mayor a cero." : "El monto es demasiado grande.";
}

function freightCarrierNameMessage({ carrierName }: FreightFormValues): string {
  return carrierName.trim() === ""
    ? "Ingresá el medio del flete."
    : `El medio puede tener hasta ${schemaLimit(carrierNameSchema.meta()?.["maxLength"])} caracteres.`;
}

function freightDescriptionMessage({ description }: FreightFormValues): string {
  return description.trim() === ""
    ? "Ingresá la descripción del flete."
    : `La descripción puede tener hasta ${schemaLimit(descriptionSchema.meta()?.["maxLength"])} caracteres.`;
}

function freightPurchasesMessage(_values: FreightFormValues): string {
  return "Elegí al menos una compra.";
}

export const FREIGHT_FIELD_MESSAGES = {
  date: freightDateMessage,
  amount: freightAmountMessage,
  carrierName: freightCarrierNameMessage,
  description: freightDescriptionMessage,
  purchaseIds: freightPurchasesMessage,
};

const periods: readonly FreightPeriod[] = [
  ...freightListQuerySchema.shape.period.def.innerType.def.out.values,
];

const [firstPeriodOption, ...otherPeriodOptions] = periods.map((days) => ({
  value: String(days),
  label: `Últimos ${days} días`,
}));

if (!firstPeriodOption) {
  throw new Error("The contract declares no freight period");
}

export const freightPeriodOptions: [typeof firstPeriodOption, ...(typeof firstPeriodOption)[]] = [
  firstPeriodOption,
  ...otherPeriodOptions,
];

export function freightPeriodOf(value: string): FreightPeriod | undefined {
  return periods.find((days) => String(days) === value);
}
