import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { Bell, LayoutDashboard } from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import { canSeeAlertsArea } from "./backoffice-access";
import { signedInRoute } from "./signed-in-route";

export const homeAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "home-area",
  component: HomeArea,
});

function HomeArea() {
  const { session } = homeAreaRoute.useRouteContext();
  const matchRoute = useMatchRoute();
  const alertsShown = Boolean(matchRoute({ to: "/alerts" }));
  return (
    <AreaLayout
      area="home"
      sectionColumnLabel="Inicio"
      sectionColumn={
        <>
          <h2 className="text-text-accent text-heading">Inicio</h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            <li>
              <SectionLink
                to="/"
                label="Resumen"
                icon={<LayoutDashboard />}
                active={Boolean(matchRoute({ to: "/" }))}
              />
            </li>
            {canSeeAlertsArea(session) && (
              <li>
                <SectionLink
                  to="/alerts"
                  search={alertsShown ? true : {}}
                  label="Alertas"
                  icon={<Bell />}
                  active={alertsShown}
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
