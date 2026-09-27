import { CATEGORY_NAME_MAX_LENGTH, isCategoryNameTooLong } from "@purosur/contracts";

export interface CategoryFieldValidationFailure {
  field: "name" | "version" | "parentId";
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

// Postgres compares `uuid` values case-insensitively but callers compare ids as JS strings;
// lowercasing keeps an uppercase spelling from slipping past those checks while still matching.
export function readParentId(body: unknown): string | null | undefined {
  const raw = (body as { parentId?: unknown } | undefined)?.parentId;
  if (raw === undefined || raw === null) {
    return null;
  }
  return typeof raw === "string" && raw.length > 0 ? raw.toLowerCase() : undefined;
}

export function hasParentId(body: unknown): boolean {
  return typeof body === "object" && body !== null && "parentId" in body;
}

export function categoryNameValidationFailure(
  name: string | undefined,
): CategoryFieldValidationFailure | undefined {
  if (!name) {
    return { field: "name", message: "name must not be empty" };
  }
  if (isCategoryNameTooLong(name)) {
    return {
      field: "name",
      message: `name must be at most ${CATEGORY_NAME_MAX_LENGTH} characters`,
    };
  }
  return undefined;
}
