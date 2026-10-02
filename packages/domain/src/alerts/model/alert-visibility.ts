import { grantsCapability, holdsPermission } from "../../access/index.js";
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

export function alertSightOf(viewer: AlertViewer): AlertSight {
  if (!grantsCapability(viewer, "alerts_area")) {
    return { kind: "none" };
  }
  if (holdsPermission(viewer, "view_all_alerts")) {
    return { kind: "all" };
  }
  return { kind: "local", locationId: viewer.locationId };
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
