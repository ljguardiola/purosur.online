import { Link } from "@tanstack/react-router";
import { focusRingClassName } from "../platform/focus-ring";
import {
  type AlertsOpenCountLinkServices,
  defaultAlertsOpenCountLinkServices,
} from "./alerts-open-count-link-services";
import { AlertsOpenCountPill } from "./alerts-open-count-pill";
import { openAlertsCount } from "./alerts-overview-section";
import { useAlertsOverviewQuery } from "./alerts-queries";

export type AlertsOpenCountLinkProps = {
  onSessionEnded: () => void;
  services?: AlertsOpenCountLinkServices | undefined;
};

export function AlertsOpenCountLink({ onSessionEnded, services }: AlertsOpenCountLinkProps) {
  const overview = useAlertsOverviewQuery({
    fetchAlertsOverview: (services ?? defaultAlertsOpenCountLinkServices).fetchAlertsOverview,
    onSessionEnded,
    onForbidden: () => {},
  });
  const openCount = overview.status === "loaded" ? openAlertsCount(overview.value) : 0;
  if (openCount === 0) {
    return null;
  }
  return (
    <Link
      to="/alerts"
      className={`rounded-full hover:ring-1 hover:ring-warning-soft ${focusRingClassName}`}
    >
      <AlertsOpenCountPill openCount={openCount} />
    </Link>
  );
}
