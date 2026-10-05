import { type CalendarDate, parseDate } from "@internationalized/date";
import {
  type IssuerIdentificationEditBody,
  issuerIdentificationEditBodySchema,
} from "@purosur/contracts";
import { schemaLimit } from "../platform/schema-limit";
import { schemaText } from "../platform/schema-text";
import type { IssuerIdentification } from "./issuer-identification-api";

export type IssuerIdentificationFormValues = {
  legalName: string;
  grossIncomeRegistration: string;
  activityStartDate: CalendarDate | null;
  version: number;
};

export const EMPTY_ISSUER_IDENTIFICATION_FORM: IssuerIdentificationFormValues = {
  legalName: "",
  grossIncomeRegistration: "",
  activityStartDate: null,
  version: 0,
};

// The two texts do not depend on the date the body is checked against.
const { legal_name: legalNameSchema, gross_income_registration: grossIncomeRegistrationSchema } =
  issuerIdentificationEditBodySchema(new Date(0)).shape;

const LEGAL_NAME_TOO_LONG_ERROR = `Ingresá como mucho ${schemaLimit(legalNameSchema.meta()?.["maxLength"])} caracteres.`;
const GROSS_INCOME_REGISTRATION_TOO_LONG_ERROR = `Ingresá como mucho ${schemaLimit(grossIncomeRegistrationSchema.meta()?.["maxLength"])} caracteres.`;

export const ACTIVITY_START_DATE_FUTURE_ERROR = "La fecha no puede ser futura.";

function dateOf(value: string | null): CalendarDate | null {
  return value === null ? null : parseDate(value);
}

export function latestActivityStartDate(now: Date): CalendarDate {
  return parseDate(
    schemaText(
      issuerIdentificationEditBodySchema(now).shape.activity_start_date.meta()?.["latestDay"],
    ),
  );
}

export function issuerIdentificationFormValuesFrom(
  value: IssuerIdentification,
): IssuerIdentificationFormValues {
  return {
    legalName: value.legalName ?? "",
    grossIncomeRegistration: value.grossIncomeRegistration ?? "",
    activityStartDate: dateOf(value.activityStartDate),
    version: value.version,
  };
}

export function issuerIdentificationRequestFrom({
  legalName,
  grossIncomeRegistration,
  activityStartDate,
  version,
}: IssuerIdentificationFormValues): IssuerIdentificationEditBody {
  return {
    legal_name: legalName.trim(),
    gross_income_registration: grossIncomeRegistration.trim(),
    activity_start_date: activityStartDate?.toString() ?? "",
    version,
  };
}

export function legalNameMessage({ legalName }: IssuerIdentificationFormValues): string {
  const trimmed = legalName.trim();
  if (trimmed === "") {
    return "Ingresá la razón social.";
  }
  return legalNameSchema.safeParse(trimmed).success
    ? "Revisá la razón social."
    : LEGAL_NAME_TOO_LONG_ERROR;
}

export function grossIncomeRegistrationMessage({
  grossIncomeRegistration,
}: IssuerIdentificationFormValues): string {
  const trimmed = grossIncomeRegistration.trim();
  if (trimmed === "") {
    return "Ingresá el número de Ingresos Brutos.";
  }
  return grossIncomeRegistrationSchema.safeParse(trimmed).success
    ? "Revisá el número de Ingresos Brutos."
    : GROSS_INCOME_REGISTRATION_TOO_LONG_ERROR;
}

export function activityStartDateMessage(today: Date) {
  const { activity_start_date: activityStartDateSchema } =
    issuerIdentificationEditBodySchema(today).shape;
  return ({ activityStartDate }: IssuerIdentificationFormValues): string => {
    if (activityStartDate === null) {
      return "Elegí la fecha de inicio de actividades.";
    }
    return activityStartDateSchema.safeParse(activityStartDate.toString()).success
      ? "Revisá la fecha de inicio de actividades."
      : ACTIVITY_START_DATE_FUTURE_ERROR;
  };
}
