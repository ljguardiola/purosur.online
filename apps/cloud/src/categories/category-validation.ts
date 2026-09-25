export interface CategoryFieldValidationFailure {
  field: "name" | "version";
  message: string;
}

// Mirrors `@purosur/contracts`'s category name limit because this app's `tsc` build (explicit
// `rootDir`) cannot import that package's untranspiled source; `category-validation.test.ts`
// guards against drift.
export const CATEGORY_NAME_MAX_LENGTH = 100;

export function categoryNameLength(name: string): number {
  return Array.from(name).length;
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
  if (categoryNameLength(name) > CATEGORY_NAME_MAX_LENGTH) {
    return {
      field: "name",
      message: `name must be at most ${CATEGORY_NAME_MAX_LENGTH} characters`,
    };
  }
  return undefined;
}
