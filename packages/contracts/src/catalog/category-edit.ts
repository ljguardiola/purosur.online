import type { z } from "zod";
import { loadedVersionSchema } from "../shared/index.js";
import { categoryCreationBodySchema } from "./category-creation.js";
import { requiredParentIdSchema } from "./category-parent-id.js";

export const categoryEditBodySchema = categoryCreationBodySchema.extend({
  parentId: requiredParentIdSchema,
  version: loadedVersionSchema,
});

export type CategoryEditBody = z.input<typeof categoryEditBodySchema>;
