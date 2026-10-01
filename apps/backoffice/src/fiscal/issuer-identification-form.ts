import { type CalendarDate, parseDate } from "@internationalized/date";
import type { IssuerIdentificationEditBody } from "@purosur/contracts";
import {
  argentinaCalendarDay,
  ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
  ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
  isIssuerIdentificationActivityStartDate,
  isIssuerIdentificationGrossIncomeRegistrationTooLong,
  isIssuerIdentificationLegalNameTooLong,
} from "@purosur/domain";
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

const LEGAL_NAME_TOO_LONG_ERROR = `Ingresá como mucho ${ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH} caracteres.`;
const GROSS_INCOME_REGISTRATION_TOO_LONG_ERROR = `Ingresá como mucho ${ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH} caracteres.`;
export const ACTIVITY_START_DATE_FUTURE_ERROR = "La fecha no puede ser futura.";

function dateOf(value: string | null): CalendarDate | null {
  return value === null ? null : parseDate(value);
}

export function latestActivityStartDate(now: Date): CalendarDate {
  return parseDate(argentinaCalendarDay(now));
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
  return isIssuerIdentificationLegalNameTooLong(trimmed)
    ? LEGAL_NAME_TOO_LONG_ERROR
    : "Revisá la razón social.";
}

export function grossIncomeRegistrationMessage({
  grossIncomeRegistration,
}: IssuerIdentificationFormValues): string {
  const trimmed = grossIncomeRegistration.trim();
  if (trimmed === "") {
    return "Ingresá el número de Ingresos Brutos.";
  }
  return isIssuerIdentificationGrossIncomeRegistrationTooLong(trimmed)
    ? GROSS_INCOME_REGISTRATION_TOO_LONG_ERROR
    : "Revisá el número de Ingresos Brutos.";
}

export function activityStartDateMessage(today: Date) {
  return ({ activityStartDate }: IssuerIdentificationFormValues): string => {
    if (activityStartDate === null) {
      return "Elegí la fecha de inicio de actividades.";
    }
    return isIssuerIdentificationActivityStartDate(activityStartDate.toString(), today)
      ? "Revisá la fecha de inicio de actividades."
      : ACTIVITY_START_DATE_FUTURE_ERROR;
  };
}
