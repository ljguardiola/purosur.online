import { LoadFailure, LoadingPlaceholder, PillLink } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import {
  type AlertsOpenCountLinkServices,
  defaultAlertsOpenCountLinkServices,
} from "./alerts-open-count-link-services";
import { useAlertsOverviewQuery } from "./alerts-queries";
import { openAlertsCount } from "./open-alerts-count";
import { openAlertsCountText } from "./open-alerts-count-text";

const AlertsLink = createLink(PillLink);

export type AlertsOpenCountLinkProps = {
  onSessionEnded: () => void;
  services?: AlertsOpenCountLinkServices | undefined;
};

export function AlertsOpenCountLink({ onSessionEnded, services }: AlertsOpenCountLinkProps) {
  const overview = useAlertsOverviewQuery({
    fetchAlertsOverview: (services ?? defaultAlertsOpenCountLinkServices).fetchAlertsOverview,
    onSessionEnded,
    whenForbidden: "fail",
  });
  if (overview.status === "loading") {
    return <LoadingPlaceholder variant="pill" />;
  }
  if (overview.status === "failed") {
    return <LoadFailure variant="pill" {...cloudLoadFailure(overview, "las alertas")} />;
  }
  const openCount = openAlertsCount(overview.value);
  if (openCount === 0) {
    return null;
  }
  return (
    <AlertsLink to="/alerts" tone="warning" icon={<Bell />}>
      {openAlertsCountText(openCount)}
    </AlertsLink>
  );
}
