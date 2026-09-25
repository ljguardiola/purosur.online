export interface CategoryFieldValidationFailure {
  field: "name" | "version";
  message: string;
}

export const CATEGORY_NAME_MAX_LENGTH = 100;

export function readCategoryName(body: unknown): string | undefined {
  const raw = (body as { name?: unknown } | undefined)?.name;
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function categoryNameValidationFailure(
  name: string | undefined,
): CategoryFieldValidationFailure | undefined {
  if (!name) {
    return { field: "name", message: "name must not be empty" };
  }
  if (name.length > CATEGORY_NAME_MAX_LENGTH) {
    return {
      field: "name",
      message: `name must be at most ${CATEGORY_NAME_MAX_LENGTH} characters`,
    };
  }
  return undefined;
}
