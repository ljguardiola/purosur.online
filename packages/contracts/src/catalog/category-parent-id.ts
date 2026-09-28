import { z } from "zod";

const INVALID_MESSAGE = "parentId must be an existing category's id, or null for top level";
const MISSING_MESSAGE = "parentId must be sent, null for top level";

// Postgres compares `uuid` values case-insensitively but callers compare ids as JS strings;
// lowercasing keeps an uppercase spelling from slipping past those checks while still matching.
function topLevelOrCategoryIdSchema(error: (issue: { input?: unknown }) => string) {
  return z.union([z.null(), z.string({ error }).min(1).toLowerCase()], { error });
}

export const optionalParentIdSchema = topLevelOrCategoryIdSchema(() => INVALID_MESSAGE)
  .optional()
  .transform((parentId) => parentId ?? null);

// A client loaded before nesting existed sends only a name and version; treating a missing
// parentId as "top level" would silently un-nest the category it renames.
export const requiredParentIdSchema = topLevelOrCategoryIdSchema((issue) =>
  issue.input === undefined ? MISSING_MESSAGE : INVALID_MESSAGE,
);
