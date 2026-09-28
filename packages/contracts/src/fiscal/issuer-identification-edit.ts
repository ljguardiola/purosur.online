import {
  ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
  ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
  isIssuerIdentificationActivityStartDate,
  isIssuerIdentificationGrossIncomeRegistrationTooLong,
  isIssuerIdentificationLegalNameTooLong,
} from "@purosur/domain";
import { z } from "zod";
import { loadedVersionSchema } from "../shared/index.js";

function requiredTextSchema(
  field: string,
  maxLength: number,
  isTooLong: (value: string) => boolean,
) {
  const message = `${field} must be a non-empty string of at most ${maxLength} characters`;
  return z
    .string({ error: message })
    .trim()
    .min(1, message)
    .refine((value) => !isTooLong(value), message);
}

export function issuerIdentificationEditBodySchema(today: Date) {
  const activityStartDateMessage =
    "activity_start_date must be a valid ISO calendar date (YYYY-MM-DD), not in the future";
  return z.object({
    legal_name: requiredTextSchema(
      "legal_name",
      ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
      isIssuerIdentificationLegalNameTooLong,
    ),
    gross_income_registration: requiredTextSchema(
      "gross_income_registration",
      ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
      isIssuerIdentificationGrossIncomeRegistrationTooLong,
    ),
    activity_start_date: z
      .string({ error: activityStartDateMessage })
      .refine(
        (value) => isIssuerIdentificationActivityStartDate(value, today),
        activityStartDateMessage,
      ),
    version: loadedVersionSchema,
  });
}

export type IssuerIdentificationEditBody = z.input<
  ReturnType<typeof issuerIdentificationEditBodySchema>
>;
