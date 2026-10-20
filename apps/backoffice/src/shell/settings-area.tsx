import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import {
  HardDriveDownload,
  Laptop,
  PackageX,
  Shield,
  ShieldAlert,
  Store,
  Users,
} from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import {
  canManageUsers,
  canSeeBackupsArea,
  canSeeBranchArea,
  canSeeQuarantinedEvents,
  canSeeRegistersArea,
  canSeeRolesArea,
  canSeeUsersArea,
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
            {canSeeUsersArea(session) ? (
              <li>
                <SectionLink
                  to="/users"
                  search={matchRoute({ to: "/users" }) ? true : {}}
                  label="Usuarios"
                  icon={<Users />}
                  active={Boolean(
                    matchRoute({ to: "/users", fuzzy: true }) || matchRoute({ to: "/account" }),
                  )}
                />
              </li>
            ) : (
              <li>
                <SectionLink
                  to="/account"
                  label="Mi cuenta"
                  icon={<Users />}
                  active={Boolean(matchRoute({ to: "/account" }))}
                />
              </li>
            )}
            {canSeeRolesArea(session) && (
              <li>
                <SectionLink
                  to="/roles"
                  label="Roles"
                  icon={<Shield />}
                  active={Boolean(matchRoute({ to: "/roles" }))}
                />
              </li>
            )}
            {canSeeRegistersArea(session) && (
              <li>
                <SectionLink
                  to="/registers"
                  label="Cajas registradoras"
                  icon={<Laptop />}
                  active={Boolean(matchRoute({ to: "/registers" }))}
                />
              </li>
            )}
            {canSeeBackupsArea(session) && (
              <li>
                <SectionLink
                  to="/backups"
                  label="Backups"
                  icon={<HardDriveDownload />}
                  active={Boolean(matchRoute({ to: "/backups" }))}
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
            {canManageUsers(session) && (
              <li>
                <SectionLink
                  to="/compromise-response"
                  label="Respuesta ante un compromiso"
                  icon={<ShieldAlert />}
                  active={Boolean(matchRoute({ to: "/compromise-response" }))}
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
