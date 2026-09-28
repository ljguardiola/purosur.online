import { CATEGORY_NAME_MAX_LENGTH, isCategoryNameTooLong } from "@purosur/domain";
import { z } from "zod";
import { optionalParentIdSchema } from "./category-parent-id.js";

const NAME_EMPTY_MESSAGE = "name must not be empty";

export const categoryNameSchema = z
  .string({ error: NAME_EMPTY_MESSAGE })
  .trim()
  .min(1, NAME_EMPTY_MESSAGE)
  .refine(
    (name) => !isCategoryNameTooLong(name),
    `name must be at most ${CATEGORY_NAME_MAX_LENGTH} characters`,
  );

export const categoryCreationBodySchema = z.object({
  name: categoryNameSchema,
  parentId: optionalParentIdSchema,
});

export type CategoryCreationBody = z.input<typeof categoryCreationBodySchema>;
