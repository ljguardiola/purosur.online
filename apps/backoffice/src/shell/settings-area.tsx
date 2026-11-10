import { Eyebrow } from "@purosur/ui";
import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { Bot, PackageX, Store, Users } from "lucide-react";
import { useId } from "react";
import { AreaLayout, SectionLink } from "./area-layout";
import {
  canSeeAiCostReport,
  canSeeBranchArea,
  canSeePeopleArea,
  canSeeQuarantinedEvents,
} from "./backoffice-access";
import { signedInRoute } from "./signed-in-route";

export const settingsAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "settings-area",
  component: SettingsArea,
});

function SettingsArea() {
  const { session } = settingsAreaRoute.useRouteContext();
  const matchRoute = useMatchRoute();
  const diagnosticsHeadingId = useId();
  return (
    <AreaLayout
      area="settings"
      sectionColumnLabel="Configuración"
      sectionColumn={
        <>
          <h2 className="text-text-accent text-heading">Configuración</h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            {canSeePeopleArea(session) && (
              <li>
                <SectionLink
                  to="/people"
                  label="Personas"
                  icon={<Users />}
                  active={Boolean(matchRoute({ to: "/people", fuzzy: true }))}
                />
              </li>
            )}
            {canSeeBranchArea(session) && (
              <li>
                <SectionLink
                  to="/location-settings"
                  label="Sucursal"
                  icon={<Store />}
                  active={Boolean(matchRoute({ to: "/location-settings" }))}
                />
              </li>
            )}
            {canSeeQuarantinedEvents(session) && (
              <li>
                <SectionLink
                  to="/quarantined-events"
                  label="Cambios de cajas retenidos"
                  icon={<PackageX />}
                  active={Boolean(matchRoute({ to: "/quarantined-events" }))}
                />
              </li>
            )}
          </ul>
          {canSeeAiCostReport(session) && (
            <>
              <div id={diagnosticsHeadingId} className="mt-4 mb-1 px-3">
                <Eyebrow text="Diagnóstico" headingLevel={3} />
              </div>
              <ul aria-labelledby={diagnosticsHeadingId} className="flex flex-col gap-1">
                <li>
                  <SectionLink
                    to="/reports/ai-cost-by-period"
                    label="Costo de IA"
                    icon={<Bot />}
                    active={Boolean(matchRoute({ to: "/reports/ai-cost-by-period" }))}
                  />
                </li>
              </ul>
            </>
          )}
        </>
      }
    >
      <Outlet />
    </AreaLayout>
  );
}
