import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { Laptop, Shield, Store, Users } from "lucide-react";
import {
  canSeeBranchArea,
  canSeeRegistersArea,
  canSeeRolesArea,
  canSeeUsersArea,
} from "../access/backoffice-access";
import { AreaLayout, SectionLink } from "./area-layout";
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
          </ul>
        </>
      }
    >
      <Outlet />
    </AreaLayout>
  );
}
