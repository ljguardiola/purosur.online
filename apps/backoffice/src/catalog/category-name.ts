import { CATEGORY_NAME_MAX_LENGTH, isCategoryNameTooLong } from "@purosur/domain";

const CATEGORY_NAME_TOO_LONG = `El nombre puede tener hasta ${CATEGORY_NAME_MAX_LENGTH} caracteres.`;

export function categoryNameError(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Ingresá el nombre de la categoría.";
  }
  if (isCategoryNameTooLong(trimmed)) {
    return CATEGORY_NAME_TOO_LONG;
  }
  return undefined;
}
