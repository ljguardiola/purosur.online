import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { canSeeAlertsArea } from "../access/backoffice-access";
import { useDocumentTitle } from "../shell/document-title";
import { homeAreaRoute } from "../shell/home-area";
import { refuseWithout } from "../shell/signed-in-route";
import { AlertsListScreen } from "./alerts-list-screen";

export const alertsListFilters = z.object({
  level: z.enum(["all", "critical", "warning", "informational"]).default("all").catch("all"),
  status: z.enum(["open", "closed"]).default("open").catch("open"),
  search: z.string().default("").catch(""),
  page: z.number().int().min(1).default(1).catch(1),
});

export type AlertsListFilters = z.output<typeof alertsListFilters>;

export const alertsListRoute = createRoute({
  getParentRoute: () => homeAreaRoute,
  path: "alerts",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeAlertsArea),
  validateSearch: alertsListFilters,
  search: { middlewares: [stripSearchParams(alertsListFilters.parse({}))] },
  component: AlertsListPage,
});

function AlertsListPage() {
  const { session, services, sessionActions } = alertsListRoute.useRouteContext();
  const filters = alertsListRoute.useSearch();
  const navigate = alertsListRoute.useNavigate();
  useDocumentTitle("Alertas · Puro Sur");
  return (
    <AlertsListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      access={session}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.alertsListScreen}
    />
  );
}
