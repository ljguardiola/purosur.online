import { isPasskeyNameTooLong, PASSKEY_NAME_MAX_LENGTH } from "@purosur/domain";

const PASSKEY_NAME_TOO_LONG = `El nombre no puede superar los ${PASSKEY_NAME_MAX_LENGTH} caracteres.`;

export function validatePasskeyName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Ingresá un nombre para la passkey.";
  }
  return isPasskeyNameTooLong(trimmed) ? PASSKEY_NAME_TOO_LONG : undefined;
}
