import { isPasskeyNameTooLong } from "@purosur/contracts";

export type PasskeyNameErrors = { required: string; tooLong: string };

/** Trims `value` and requires it to be non-empty and within the length the cloud enforces. */
export function validatePasskeyName(value: string, errors: PasskeyNameErrors): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return errors.required;
  }
  return isPasskeyNameTooLong(trimmed) ? errors.tooLong : undefined;
}
