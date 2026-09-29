import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { Bell, LayoutDashboard } from "lucide-react";
import { canSeeAlertsArea } from "../access/backoffice-access";
import { AreaLayout, SectionLink } from "./area-layout";
import { signedInRoute } from "./signed-in-route";

export const homeAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "home",
  component: HomeArea,
});

function HomeArea() {
  const { session } = homeAreaRoute.useRouteContext();
  const matchRoute = useMatchRoute();
  const alertsShown = Boolean(matchRoute({ to: "/home/alerts" }));
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
                to="/home"
                label="Resumen"
                icon={<LayoutDashboard />}
                active={Boolean(matchRoute({ to: "/home" }))}
              />
            </li>
            {canSeeAlertsArea(session) && (
              <li>
                <SectionLink
                  to="/home/alerts"
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
