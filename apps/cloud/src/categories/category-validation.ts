import { CATEGORY_NAME_MAX_LENGTH, categoryNameLength } from "@purosur/contracts";

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

/**
 * Reads `parentId` from the request body: `null` for an absent or explicit `null` value (meaning
 * a top-level category), the id string for any other non-empty string, and `undefined` for
 * anything else (malformed). Whether a non-empty string is a well-formed id that names an existing
 * category is checked later, against the database, the same way `readCategoryId`
 * (`product-validation.ts`) defers it.
 *
 * The id is lowercased because Postgres compares `uuid` values case-insensitively while the edit
 * route compares ids as JavaScript strings (unchanged parent, cycle walk): an uppercase spelling
 * of a category's own id would otherwise slip past those checks and still match in the database.
 */
export function readParentId(body: unknown): string | null | undefined {
  const raw = (body as { parentId?: unknown } | undefined)?.parentId;
  if (raw === undefined || raw === null) {
    return null;
  }
  return typeof raw === "string" && raw.length > 0 ? raw.toLowerCase() : undefined;
}

/** Whether the request body carries a `parentId` key at all, whatever its value. */
export function hasParentId(body: unknown): boolean {
  return typeof body === "object" && body !== null && "parentId" in body;
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
