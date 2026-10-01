import { holdsPermission } from "../../access/index.js";
import type { AlertAudience } from "./alert-catalog.js";

export interface AlertAudienceAccess {
  isAdministrator: boolean;
  permissionKeys: readonly string[];
}

export interface AlertViewer extends AlertAudienceAccess {
  locationId: string;
}

export type VisibleAlertSight = { kind: "all" } | { kind: "local"; locationId: string };

export type AlertSight = VisibleAlertSight | { kind: "none" };

export function canSeeAnyAlerts(access: AlertAudienceAccess): boolean {
  return (
    holdsPermission(access, "view_all_alerts") || holdsPermission(access, "view_branch_alerts")
  );
}

export function alertSightOf(viewer: AlertViewer): AlertSight {
  if (holdsPermission(viewer, "view_all_alerts")) {
    return { kind: "all" };
  }
  if (holdsPermission(viewer, "view_branch_alerts")) {
    return { kind: "local", locationId: viewer.locationId };
  }
  return { kind: "none" };
}

export function canSeeAlert(
  viewer: AlertViewer,
  alert: { audience: AlertAudience; locationId: string | null },
): boolean {
  const sight = alertSightOf(viewer);
  switch (sight.kind) {
    case "all":
      return true;
    case "local":
      return alert.audience === "local" && alert.locationId === sight.locationId;
    case "none":
      return false;
  }
}

export function alertLocationId(
  audience: AlertAudience,
  locationId: string | undefined,
): string | null {
  return audience === "local" ? (locationId ?? null) : null;
}
