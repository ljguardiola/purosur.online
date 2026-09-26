import { isPasskeyNameTooLong } from "@purosur/contracts";

export type PasskeyNameErrors = { required: string; tooLong: string };

export function validatePasskeyName(value: string, errors: PasskeyNameErrors): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return errors.required;
  }
  return isPasskeyNameTooLong(trimmed) ? errors.tooLong : undefined;
}
