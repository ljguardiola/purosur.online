import type { ZodType } from "zod";

type EmailMessages = { required: string; invalid: string; review: string };

export function emailFieldMessage(shape: ZodType, { required, invalid, review }: EmailMessages) {
  return ({ email }: { email: string }): string => {
    const trimmed = email.trim();
    if (trimmed === "") {
      return required;
    }
    return shape.safeParse(trimmed).success ? review : invalid;
  };
}

export function userEmailMessage(shape: ZodType) {
  return emailFieldMessage(shape, {
    required: "Ingresá el correo.",
    invalid: "Ingresá un correo válido.",
    review: "Revisá el correo.",
  });
}
