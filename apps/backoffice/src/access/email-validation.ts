const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

export type EmailErrors = { required: string; invalid: string };

export function validateEmail(value: string, errors: EmailErrors): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return errors.required;
  }
  return EMAIL_SHAPE.test(trimmed) ? undefined : errors.invalid;
}
