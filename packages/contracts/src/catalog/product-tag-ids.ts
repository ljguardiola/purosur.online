import { repeatsATag } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

const INVALID_MESSAGE = "tagIds must be a list of existing tags' ids, [] for none";
const MISSING_MESSAGE = "tagIds must be sent, [] for none";
const REPEATED_MESSAGE = "tagIds must not repeat a tag";

function tagIdsSchema(error: (issue: { input?: unknown }) => string) {
  return z
    .array(recordIdSchema(error), { error })
    .refine((tagIds) => !repeatsATag(tagIds), REPEATED_MESSAGE);
}

export const optionalTagIdsSchema = tagIdsSchema(() => INVALID_MESSAGE)
  .optional()
  .transform((tagIds) => tagIds ?? []);

// A client loaded before tags existed sends no tagIds; treating a missing one as "no tags"
// would silently remove the tags of the product it edits.
export const requiredTagIdsSchema = tagIdsSchema((issue) =>
  issue.input === undefined ? MISSING_MESSAGE : INVALID_MESSAGE,
);
