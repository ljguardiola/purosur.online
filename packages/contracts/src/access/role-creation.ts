import {
  holdsBothAlertViewPermissions,
  isAdministratorRoleName,
  isPermissionKey,
  isRoleNameTooLong,
  ROLE_NAME_MAX_LENGTH,
  repeatsAPermissionKey,
} from "@purosur/domain";
import { z } from "zod";

const PERMISSIONS_TYPE_MESSAGE = "permissions must be an array of permission keys";

export const roleCreationBodySchema = z.object({
  name: z
    .string({ error: "name must not be empty" })
    .trim()
    .min(1, "name must not be empty")
    .refine(
      (name) => !isRoleNameTooLong(name),
      `name must be at most ${ROLE_NAME_MAX_LENGTH} characters`,
    )
    .refine(
      (name) => !isAdministratorRoleName(name),
      "name must not be the Administrator role's own name",
    ),
  permissions: z
    .array(z.string({ error: PERMISSIONS_TYPE_MESSAGE }), { error: PERMISSIONS_TYPE_MESSAGE })
    .refine((keys) => keys.every(isPermissionKey), "permissions must all be known permission keys")
    .refine((keys) => !repeatsAPermissionKey(keys), "permissions must not repeat a key")
    .refine(
      (keys) => !holdsBothAlertViewPermissions(keys),
      "a role can hold at most one of the alert-view permissions",
    ),
});

export type RoleCreationBody = z.input<typeof roleCreationBodySchema>;
