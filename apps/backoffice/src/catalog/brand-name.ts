import { BRAND_NAME_MAX_LENGTH, isBrandNameTooLong } from "@purosur/domain";

export function brandNameMessage({ name }: { name: string }): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Ingresá el nombre de la marca.";
  }
  if (isBrandNameTooLong(trimmed)) {
    return `El nombre puede tener hasta ${BRAND_NAME_MAX_LENGTH} caracteres.`;
  }
  return "Revisá el nombre de la marca.";
}
