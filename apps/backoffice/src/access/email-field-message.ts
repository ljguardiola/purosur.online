type EmailMessages = { required: string; invalid: string };

export function emailFieldMessage({ required, invalid }: EmailMessages) {
  return ({ email }: { email: string }): string => (email.trim() === "" ? required : invalid);
}

export const userEmailMessage = emailFieldMessage({
  required: "Ingresá el correo.",
  invalid: "Ingresá un correo válido.",
});
