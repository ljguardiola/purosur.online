export interface CategoryFieldValidationFailure {
  field: "name" | "version";
  message: string;
}

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
  return undefined;
}
