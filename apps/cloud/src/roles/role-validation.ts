import { ALERT_VIEW_PERMISSION_KEYS, isPermissionKey } from "./permission-catalog.js";

/** The Administrator role's own reserved name, checked case-insensitively; shared by creation and edit. */
export const ADMINISTRATOR_NAME = "administrador";

export interface RoleFieldValidationFailure {
  field: "name" | "permissions" | "version";
  message: string;
}

export function readRoleName(body: unknown): string | undefined {
  const raw = (body as { name?: unknown } | undefined)?.name;
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readRolePermissionKeys(body: unknown): string[] | undefined {
  const raw = (body as { permissions?: unknown } | undefined)?.permissions;
  if (!Array.isArray(raw) || !raw.every((entry): entry is string => typeof entry === "string")) {
    return undefined;
  }
  return raw;
}

/** Empty (after trimming) or the Administrator role's own reserved name, case-insensitively. */
export function roleNameValidationFailure(
  name: string | undefined,
): RoleFieldValidationFailure | undefined {
  if (!name) {
    return { field: "name", message: "name must not be empty" };
  }
  if (name.toLowerCase() === ADMINISTRATOR_NAME) {
    return { field: "name", message: "name must not be the Administrator role's own name" };
  }
  return undefined;
}

export function rolePermissionsValidationFailure(
  permissionKeys: string[],
): RoleFieldValidationFailure | undefined {
  if (!permissionKeys.every(isPermissionKey)) {
    return { field: "permissions", message: "permissions must all be known permission keys" };
  }
  if (new Set(permissionKeys).size !== permissionKeys.length) {
    return { field: "permissions", message: "permissions must not repeat a key" };
  }
  const [firstAlertView, secondAlertView] = ALERT_VIEW_PERMISSION_KEYS;
  if (permissionKeys.includes(firstAlertView) && permissionKeys.includes(secondAlertView)) {
    return {
      field: "permissions",
      message: "a role can hold at most one of the alert-view permissions",
    };
  }
  return undefined;
}
