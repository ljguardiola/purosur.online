import type { AlertDetailModalServices } from "./alert-detail-modal";
import { fetchAlerts as fetchAlertsDefault } from "./alerts-api";

export type AlertsListScreenServices = {
  fetchAlerts: typeof fetchAlertsDefault;
  alertDetailModal?: AlertDetailModalServices;
};

export const defaultAlertsListScreenServices: AlertsListScreenServices = {
  fetchAlerts: fetchAlertsDefault,
};
