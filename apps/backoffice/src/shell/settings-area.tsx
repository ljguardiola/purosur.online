import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { PackageX, QrCode, Store, Users } from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import {
  canSeeBranchArea,
  canSeeContingencyTicketRescue,
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
            {canSeeContingencyTicketRescue(session) && (
              <li>
                <SectionLink
                  to="/contingency-ticket-rescue"
                  label="Rescate de tickets"
                  icon={<QrCode />}
                  active={Boolean(matchRoute({ to: "/contingency-ticket-rescue" }))}
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
                  label="Eventos en cuarentena"
                  icon={<PackageX />}
                  active={Boolean(matchRoute({ to: "/quarantined-events" }))}
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
