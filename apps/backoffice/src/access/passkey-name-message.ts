import { isPasskeyNameTooLong, PASSKEY_NAME_MAX_LENGTH } from "@purosur/domain";

export function passkeyNameMessage({ name }: { name: string }): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Ingresá un nombre para la passkey.";
  }
  return isPasskeyNameTooLong(trimmed)
    ? `El nombre no puede superar los ${PASSKEY_NAME_MAX_LENGTH} caracteres.`
    : "Revisá el nombre de la passkey.";
}
