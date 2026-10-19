import type { BitlockerRecoveryKeyLoadBody } from "@purosur/contracts";

export type BitlockerKeyFormValues = {
  recoveryKey: string;
  keyIdentifier: string;
};

export const EMPTY_BITLOCKER_KEY_FORM: BitlockerKeyFormValues = {
  recoveryKey: "",
  keyIdentifier: "",
};

export function bitlockerKeyRequestFrom({
  recoveryKey,
  keyIdentifier,
}: BitlockerKeyFormValues): BitlockerRecoveryKeyLoadBody {
  return { recovery_key: recoveryKey.trim(), key_identifier: keyIdentifier.trim().toUpperCase() };
}

export function bitlockerRecoveryKeyMessage({
  recoveryKey,
}: Pick<BitlockerKeyFormValues, "recoveryKey">): string {
  return recoveryKey.trim() === ""
    ? "Ingresá la clave de 48 dígitos en ocho bloques de seis, separados por guiones."
    : "Revisá la clave: son ocho bloques de seis dígitos separados por guiones.";
}

export function bitlockerKeyIdentifierMessage({
  keyIdentifier,
}: Pick<BitlockerKeyFormValues, "keyIdentifier">): string {
  return keyIdentifier.trim() === ""
    ? "Ingresá los 8 caracteres del identificador."
    : "Revisá el identificador: son 8 caracteres, números del 0 al 9 y letras de la A a la F.";
}
