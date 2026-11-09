import { fetchAlerts, fetchAlertsOverview } from "../alerts/alerts-api";
import type { AlertsListSectionServices } from "../alerts/alerts-list-services";
import { fetchFiscalTasks } from "../fiscal/fiscal-tasks-api";
import { fetchRegisterSyncStatus } from "../installation/registers-api";
import { fetchPendingRefunds } from "../payments/refunds-api";
import { fetchPrices } from "../pricing/prices-api";
import type { PendingTasksSectionServices } from "./pending-tasks-section";

export type HomeScreenServices = AlertsListSectionServices &
  PendingTasksSectionServices & {
    fetchAlertsOverview: typeof fetchAlertsOverview;
    fetchRegisterSyncStatus: typeof fetchRegisterSyncStatus;
  };

export const defaultHomeScreenServices: HomeScreenServices = {
  fetchAlertsOverview,
  fetchRegisterSyncStatus,
  fetchAlerts,
  fetchFiscalTasks,
  fetchPendingRefunds,
  fetchPrices,
};
