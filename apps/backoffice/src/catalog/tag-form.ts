import { isTagNameTooLong, TAG_NAME_MAX_LENGTH } from "@purosur/domain";
import { formatNumber, plural } from "@purosur/ui";

export const TAG_NAME_TAKEN = "Ya existe un distintivo con este nombre.";

export const EMPTY_TAG_EDIT_FORM = { name: "", version: 1 };

export const TAG_EDIT_FIELDS = { name: "name", version: null } as const;

export function tagNameMessage({ name }: { name: string }): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Ingresá el nombre del distintivo.";
  }
  if (isTagNameTooLong(trimmed)) {
    return `El nombre puede tener hasta ${TAG_NAME_MAX_LENGTH} caracteres.`;
  }
  return "Revisá el nombre del distintivo.";
}

export function tagEditRequestFrom({ name, version }: { name: string; version: number }) {
  return { name: name.trim(), version };
}

export function renameReachText(productCount: number): string | undefined {
  if (productCount === 0) {
    return undefined;
  }
  return plural(productCount, {
    one: "El nombre nuevo se ve en su producto.",
    other: `El nombre nuevo se ve en sus ${formatNumber(productCount)} productos.`,
  });
}
