import { isPermissionKey, PERMISSION_AREAS } from "@purosur/domain";
import { z } from "zod";

const permissionKeySchema = z.string().refine(isPermissionKey);

export const permissionSchema = z.object({
  key: permissionKeySchema,
  register_marker: z.enum(["none", "register", "register_with_another_persons_pin"]),
  requires: z.array(permissionKeySchema),
});

export const permissionAreaSchema = z.object({
  area: z.enum(PERMISSION_AREAS),
  permissions: z.array(permissionSchema),
});

export const permissionCatalogSchema = z.array(permissionAreaSchema);

export type PermissionCatalogWire = z.output<typeof permissionCatalogSchema>;
