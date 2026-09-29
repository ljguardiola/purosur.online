import { isPasskeyNameTooLong, PASSKEY_NAME_MAX_LENGTH } from "@purosur/domain";

export function passkeyNameMessage({ name }: { name: string }): string {
  return isPasskeyNameTooLong(name.trim())
    ? `El nombre no puede superar los ${PASSKEY_NAME_MAX_LENGTH} caracteres.`
    : "Ingresá un nombre para la passkey.";
}
