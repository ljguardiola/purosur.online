import type { AlertAudience, AlertKind, AlertLevel } from "../model/alert-catalog.js";
import type { VisibleAlertSight } from "../model/alert-visibility.js";

export interface AlertSummary {
  id: string;
  kind: AlertKind;
  scope: string;
  level: AlertLevel;
  audience: AlertAudience;
  locationId: string | null;
  openedAt: Date;
  escalateAt: Date | null;
  escalatedAt: Date | null;
  resolvedAt: Date | null;
}

export interface AlertDetailView extends AlertSummary {
  detail: Record<string, unknown>;
  resolvedBy: string | null;
}

export interface AlertSearch {
  text: string;
  kindsWithMatchingTitle: readonly AlertKind[];
}

export interface AlertListFilters {
  level?: AlertLevel | undefined;
  open?: boolean | undefined;
  search?: AlertSearch | undefined;
}

export interface AlertListPage {
  alerts: AlertSummary[];
  total: number;
}

export interface OpenAlertCounts {
  openCount: number;
  openCriticalCount: number;
}

export type OpenAlertsOverview = Record<AlertLevel, { openCount: number; kinds: AlertKind[] }>;

export interface AlertDelivery {
  channel: string;
  status: string;
  error: string | null;
  createdAt: Date;
  recipientId: string;
  recipientFirstName: string;
  recipientRoleId: string;
  recipientRoleName: string | null;
  recipientRoleIsAdministrator: boolean;
}

export interface AlertReader {
  findVisibleAlert(sight: VisibleAlertSight, alertId: string): Promise<AlertDetailView | undefined>;
  listVisibleAlerts(
    sight: VisibleAlertSight,
    filters: AlertListFilters,
    page: number,
  ): Promise<AlertListPage>;
  countOpenVisibleAlerts(sight: VisibleAlertSight): Promise<OpenAlertCounts>;
  overviewOfOpenVisibleAlerts(sight: VisibleAlertSight): Promise<OpenAlertsOverview>;
  deliveriesOf(alertId: string): Promise<AlertDelivery[]>;
  displayNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
