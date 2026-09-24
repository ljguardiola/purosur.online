const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

export type EmailErrors = { required: string; invalid: string };

/** Trims `value` and requires it to look like local@domain. */
export function validateEmail(value: string, errors: EmailErrors): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return errors.required;
  }
  return EMAIL_SHAPE.test(trimmed) ? undefined : errors.invalid;
}
