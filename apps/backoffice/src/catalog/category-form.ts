import type { CategorySummary } from "@purosur/contracts";
import { CATEGORY_NAME_MAX_LENGTH, isCategoryNameTooLong } from "@purosur/domain";
import type { Option, Options } from "@purosur/ui";
import { categoriesInTreeOrder, categoryPathLabels } from "./category-path";

export const NO_PARENT_VALUE = "";

export const CATEGORY_NAME_TAKEN = "Ya existe una categoría con este nombre.";
export const CATEGORY_PARENT_NOT_FOUND_ERROR = "La categoría superior elegida ya no existe.";
export const CATEGORY_PARENT_HELPER_TEXT = "Opcional. Vacío para una categoría de primer nivel.";

export function nameTakenUnderParentError(params: { name: string; parent: string }): string {
  return `Ya existe una categoría "${params.name}" en ${params.parent}.`;
}

export function parentSelectOptions(
  categories: CategorySummary[],
  excludeIds: ReadonlySet<string>,
): Options<Option<string>> {
  const labels = categoryPathLabels(categories);
  const sorted = categoriesInTreeOrder(categories).filter(
    (category) => !excludeIds.has(category.id),
  );
  const noneOption: Option<string> = {
    value: "",
    label: "Ninguna (categoría de primer nivel)",
  };
  return [
    noneOption,
    ...sorted.map((category) => ({
      value: category.id,
      label: labels.get(category.id) ?? category.name,
    })),
  ];
}

export function parentIdOf(parentValue: string): string | null {
  return parentValue === NO_PARENT_VALUE ? null : parentValue;
}

export function categoryName(categories: CategorySummary[], id: string | null | undefined): string {
  return categories.find((category) => category.id === id)?.name ?? "";
}

export function categoryFormValues(category: CategorySummary) {
  return {
    name: category.name,
    parentValue: category.parentId ?? NO_PARENT_VALUE,
    version: category.version,
  };
}

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
