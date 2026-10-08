import { fetchAlertsOverview } from "../alerts/alerts-api";
import type { AlertsOverviewSectionServices } from "../alerts/alerts-overview-section";
import { fetchRegisterSyncStatus } from "../register/registers-api";
import type { RegistersSyncSectionServices } from "../register/registers-sync-section";

export type HomeScreenServices = AlertsOverviewSectionServices & RegistersSyncSectionServices;

export const defaultHomeScreenServices: HomeScreenServices = {
  fetchAlertsOverview,
  fetchRegisterSyncStatus,
};
