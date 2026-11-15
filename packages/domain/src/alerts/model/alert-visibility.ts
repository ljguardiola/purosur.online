import { alertSightKindOf } from "../../permissions/index.js";
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
  const kind = alertSightKindOf(viewer);
  return kind === "local" ? { kind, locationId: viewer.locationId } : { kind };
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

export function isAlertOfViewerBranch(
  viewer: Pick<AlertViewer, "locationId">,
  alert: { locationId: string | null },
): boolean {
  return alert.locationId === viewer.locationId;
}

export function alertLocationId(
  audience: AlertAudience,
  locationId: string | undefined,
): string | null {
  return audience === "local" ? (locationId ?? null) : null;
}
