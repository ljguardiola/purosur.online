import { signInLookupMessageSchema } from "@purosur/contracts";

export const signInLookupRequestSchema = signInLookupMessageSchema.omit({
  type: true,
  request_id: true,
});

export const INVALID_EMAIL_MESSAGE = "Escribí un correo válido.";

export type FirstSignInEmailFormValues = { email: string };

export const EMPTY_FIRST_SIGN_IN_EMAIL_FORM: FirstSignInEmailFormValues = { email: "" };

export function signInLookupRequestFrom({ email }: FirstSignInEmailFormValues): { email: string } {
  return { email };
}
