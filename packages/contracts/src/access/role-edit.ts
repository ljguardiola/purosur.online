import type { z } from "zod";
import { loadedVersionSchema } from "./loaded-version.js";
import { roleCreationBodySchema } from "./role-creation.js";

export const roleEditBodySchema = roleCreationBodySchema.extend({ version: loadedVersionSchema });

export type RoleEditBody = z.input<typeof roleEditBodySchema>;
