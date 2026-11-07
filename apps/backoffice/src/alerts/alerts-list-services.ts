import type { AlertDetailModalServices } from "./alert-detail-modal";
import type { fetchAlerts } from "./alerts-api";

export type AlertsListSectionServices = {
  fetchAlerts: typeof fetchAlerts;
  alertDetailModal?: AlertDetailModalServices;
};
