import type { z } from "zod";
import { loadedVersionSchema } from "../shared/index.js";
import { brandCreationBodySchema } from "./brand-creation.js";

export const brandEditBodySchema = brandCreationBodySchema.extend({
  version: loadedVersionSchema,
});

export type BrandEditBody = z.input<typeof brandEditBodySchema>;
