import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { ChartColumn } from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import { canSeeReportsPage } from "./backoffice-access";
import { signedInRoute } from "./signed-in-route";

export const reportsAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "reports-area",
  component: ReportsArea,
});

function ReportsArea() {
  const { session } = signedInRoute.useRouteContext();
  const matchRoute = useMatchRoute();
  return (
    <AreaLayout
      area="reports"
      sectionColumnLabel="Reportes"
      sectionColumn={
        <>
          <h2 className="text-text-accent text-heading">Reportes</h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            {canSeeReportsPage(session) && (
              <li>
                <SectionLink
                  to="/reports"
                  label="Reportes"
                  icon={<ChartColumn />}
                  active={Boolean(matchRoute({ to: "/reports", fuzzy: true }))}
                />
              </li>
            )}
          </ul>
        </>
      }
    >
      <Outlet />
    </AreaLayout>
  );
}
