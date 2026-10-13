import { fetchAlertsOverview } from "./alerts-api";

export type AlertsOpenCountLinkServices = {
  fetchAlertsOverview: typeof fetchAlertsOverview;
};

export const defaultAlertsOpenCountLinkServices: AlertsOpenCountLinkServices = {
  fetchAlertsOverview,
};
