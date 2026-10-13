import { LoadingPlaceholder, PillButton, PillLink } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { Bell, RotateCw } from "lucide-react";
import { useState } from "react";
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
  const [refused, setRefused] = useState(false);
  const overview = useAlertsOverviewQuery({
    fetchAlertsOverview: (services ?? defaultAlertsOpenCountLinkServices).fetchAlertsOverview,
    onSessionEnded,
    onForbidden: () => setRefused(true),
  });
  if (refused) {
    return null;
  }
  if (overview.status === "loading") {
    return <LoadingPlaceholder variant="pill" />;
  }
  if (overview.status === "failed") {
    return (
      <PillButton
        tone="error"
        icon={<RotateCw />}
        aria-label="No se cargaron las alertas. Reintentar"
        onPress={overview.retry}
      >
        No se cargaron las alertas
      </PillButton>
    );
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
