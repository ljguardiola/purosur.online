import { type AlertViewer, alertSightOf, type VisibleAlertSight } from "@purosur/domain";

export function visibleSightOf(viewer: AlertViewer): VisibleAlertSight | undefined {
  const sight = alertSightOf(viewer);
  return sight.kind === "none" ? undefined : sight;
}
