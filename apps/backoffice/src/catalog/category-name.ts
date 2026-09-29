import { CATEGORY_NAME_MAX_LENGTH, isCategoryNameTooLong } from "@purosur/domain";

export function categoryNameMessage({ name }: { name: string }): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Ingresá el nombre de la categoría.";
  }
  if (isCategoryNameTooLong(trimmed)) {
    return `El nombre puede tener hasta ${CATEGORY_NAME_MAX_LENGTH} caracteres.`;
  }
  return "Revisá el nombre de la categoría.";
}
