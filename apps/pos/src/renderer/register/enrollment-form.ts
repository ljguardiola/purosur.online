import { deviceEnrollmentBodySchema } from "@purosur/contracts";

export const enrollmentRequestSchema = deviceEnrollmentBodySchema.pick({ code: true });

export const INCOMPLETE_CODE_MESSAGE = "Escribí los 16 caracteres del código de alta.";

export type EnrollmentFormValues = { code: string };

export const EMPTY_ENROLLMENT_FORM: EnrollmentFormValues = { code: "" };

export function enrollmentRequestFrom({ code }: EnrollmentFormValues): { code: string } {
  return { code };
}
