import { z } from "zod";

const INVALID_MESSAGE = "brandId must be an existing brand's id, or null for none";
const MISSING_MESSAGE = "brandId must be sent, null for none";

// Postgres compares `uuid` values case-insensitively but callers compare ids as JS strings;
// lowercasing keeps an uppercase spelling from slipping past those checks while still matching.
function noneOrBrandIdSchema(error: (issue: { input?: unknown }) => string) {
  return z.union([z.null(), z.string({ error }).min(1).toLowerCase()], { error });
}

export const optionalBrandIdSchema = noneOrBrandIdSchema(() => INVALID_MESSAGE)
  .optional()
  .transform((brandId) => brandId ?? null);

// A client loaded before brands existed sends no brandId; treating a missing one as "no brand"
// would silently remove the brand of the product it edits.
export const requiredBrandIdSchema = noneOrBrandIdSchema((issue) =>
  issue.input === undefined ? MISSING_MESSAGE : INVALID_MESSAGE,
);
