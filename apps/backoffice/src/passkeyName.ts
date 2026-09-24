export const PASSKEY_NAME_MAX_LENGTH = 40;

export type PasskeyNameErrors = { required: string; tooLong: string };

/** Trims `value` and requires it to be 1-40 characters, the same rule the cloud enforces. */
export function validatePasskeyName(value: string, errors: PasskeyNameErrors): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return errors.required;
  }
  return trimmed.length <= PASSKEY_NAME_MAX_LENGTH ? undefined : errors.tooLong;
}
