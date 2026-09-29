import { isRegisterNameTooLong, REGISTER_NAME_MAX_LENGTH } from "@purosur/domain";

export function registerNameMessage({ name }: { name: string }): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Ingresá el nombre de la caja.";
  }
  return isRegisterNameTooLong(trimmed)
    ? `El nombre puede tener hasta ${REGISTER_NAME_MAX_LENGTH} caracteres.`
    : "Revisá el nombre de la caja.";
}
