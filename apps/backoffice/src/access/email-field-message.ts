type EmailMessages = { required: string; invalid: string };

export function emailFieldMessage({ required, invalid }: EmailMessages) {
  return ({ email }: { email: string }): string => (email.trim() === "" ? required : invalid);
}
