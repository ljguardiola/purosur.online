import type { RoleAccess } from "./access-increase.js";
import { grantsCapability } from "./capability-permissions.js";
import { holdsPermission } from "./holds-permission.js";

export type AlertSightKind = "none" | "local" | "all";

export function alertSightKindOf(access: RoleAccess): AlertSightKind {
  if (!grantsCapability(access, "alerts_area")) {
    return "none";
  }
  return holdsPermission(access, "view_all_alerts") ? "all" : "local";
}
