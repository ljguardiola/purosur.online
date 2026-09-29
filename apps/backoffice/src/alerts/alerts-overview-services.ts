import { fetchAlertsOverview as fetchAlertsOverviewDefault } from "./alerts-api";

export type AlertsOverviewScreenServices = {
  fetchAlertsOverview: typeof fetchAlertsOverviewDefault;
};

export const defaultAlertsOverviewScreenServices: AlertsOverviewScreenServices = {
  fetchAlertsOverview: fetchAlertsOverviewDefault,
};
