import type { ZodType } from "zod";
import { emailFieldMessage } from "../platform/email-field-message";

export function userEmailMessage(shape: ZodType) {
  return emailFieldMessage(shape, {
    required: "Ingresá el correo.",
    invalid: "Ingresá un correo válido.",
    review: "Revisá el correo.",
  });
}
