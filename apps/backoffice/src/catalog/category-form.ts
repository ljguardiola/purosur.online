import { type CategorySummary, categoryCreationBodySchema } from "@purosur/contracts";
import type { Option, Options } from "@purosur/ui";
import { categoriesInTreeOrder, categoryPathLabels } from "../platform/category-path";
import { schemaLimit } from "../platform/schema-limit";

const categoryNameSchema = categoryCreationBodySchema.shape.name;

const NO_PARENT_VALUE = "";

type CategoryFormValues = { name: string; parentValue: string };

type CategoryEditFormValues = CategoryFormValues & { version: number };

export const EMPTY_CATEGORY_FORM: CategoryFormValues = { name: "", parentValue: NO_PARENT_VALUE };

export const CATEGORY_NAME_TAKEN = "Ya existe una categoría con este nombre.";
const CATEGORY_PARENT_NOT_FOUND_ERROR = "La categoría superior elegida ya no existe.";
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

function parentIdOf(parentValue: string): string | null {
  return parentValue === NO_PARENT_VALUE ? null : parentValue;
}

export function categoryName(categories: CategorySummary[], id: string | null | undefined): string {
  return categories.find((category) => category.id === id)?.name ?? "";
}

export function categoryFormValues(category: CategorySummary): CategoryEditFormValues {
  return {
    name: category.name,
    parentValue: category.parentId ?? NO_PARENT_VALUE,
    version: category.version,
  };
}

export function categoryRequestFrom({ name, parentValue }: CategoryFormValues) {
  return {
    name: name.trim(),
    parentId: parentIdOf(parentValue),
  };
}

export function categoryEditRequestFrom({ name, parentValue, version }: CategoryEditFormValues) {
  return {
    name: name.trim(),
    parentId: parentIdOf(parentValue),
    version,
  };
}

export const CATEGORY_FIELDS = { name: "name", parentId: "parentValue" } as const;

export const CATEGORY_EDIT_FIELDS = { ...CATEGORY_FIELDS, version: null } as const;

export function categoryNameMessage({ name }: { name: string }): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Ingresá el nombre de la categoría.";
  }
  if (!categoryNameSchema.safeParse(trimmed).success) {
    return `El nombre puede tener hasta ${schemaLimit(categoryNameSchema.meta()?.["maxLength"])} caracteres.`;
  }
  return "Revisá el nombre de la categoría.";
}

export const CATEGORY_MESSAGES = {
  name: categoryNameMessage,
  parentValue: CATEGORY_PARENT_NOT_FOUND_ERROR,
};
