import type { z } from "zod";
import { loadedVersionSchema } from "../shared/index.js";
import { packagingCreationBodySchema } from "./packaging-creation.js";

export const packagingEditBodySchema = packagingCreationBodySchema
  .omit({ productId: true })
  .extend({ version: loadedVersionSchema });

export type PackagingEditBody = z.input<typeof packagingEditBodySchema>;
