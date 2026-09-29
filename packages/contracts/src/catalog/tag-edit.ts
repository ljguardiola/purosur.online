import type { z } from "zod";
import { loadedVersionSchema } from "../shared/index.js";
import { tagCreationBodySchema } from "./tag-creation.js";

export const tagEditBodySchema = tagCreationBodySchema.extend({
  version: loadedVersionSchema,
});

export type TagEditBody = z.input<typeof tagEditBodySchema>;
