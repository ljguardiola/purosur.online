import { fetchAlertsOverview } from "../alerts/alerts-api";
import { fetchRegisterSyncStatus } from "../register/registers-api";

export type HomeScreenServices = {
  fetchAlertsOverview: typeof fetchAlertsOverview;
  fetchRegisterSyncStatus: typeof fetchRegisterSyncStatus;
};

export const defaultHomeScreenServices: HomeScreenServices = {
  fetchAlertsOverview,
  fetchRegisterSyncStatus,
};
