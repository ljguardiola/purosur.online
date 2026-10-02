import { userCreationBodySchema } from "@purosur/contracts";

type EmailMessages = { required: string; invalid: string; review: string };

export function emailFieldMessage({ required, invalid, review }: EmailMessages) {
  return ({ email }: { email: string }): string => {
    const trimmed = email.trim();
    if (trimmed === "") {
      return required;
    }
    return userCreationBodySchema.shape.email.safeParse(trimmed).success ? review : invalid;
  };
}

export const userEmailMessage = emailFieldMessage({
  required: "Ingresá el correo.",
  invalid: "Ingresá un correo válido.",
  review: "Revisá el correo.",
});
