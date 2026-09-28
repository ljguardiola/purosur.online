import type { z } from "zod";
import { loadedVersionSchema } from "./loaded-version.js";
import { userCreationBodySchema } from "./user-creation.js";

export const userEditBodySchema = userCreationBodySchema
  .pick({ email: true, role_id: true })
  .extend({ version: loadedVersionSchema });

export type UserEditBody = z.input<typeof userEditBodySchema>;
