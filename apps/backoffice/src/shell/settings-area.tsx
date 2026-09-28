import { createRoute, Outlet, redirect, useMatchRoute } from "@tanstack/react-router";
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
  path: "settings",
  component: SettingsArea,
});

export const settingsAreaIndexRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/help" });
  },
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
          <h2 className="font-bold text-text-accent text-heading">Configuración</h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            {canSeeUsersArea(session) ? (
              <li>
                <SectionLink
                  to="/settings/users"
                  search={matchRoute({ to: "/settings/users" }) ? true : {}}
                  label="Usuarios"
                  icon={<Users />}
                  active={Boolean(matchRoute({ to: "/settings/users", fuzzy: true }))}
                />
              </li>
            ) : (
              <li>
                <SectionLink
                  to="/settings/users/me"
                  label="Mi cuenta"
                  icon={<Users />}
                  active={Boolean(matchRoute({ to: "/settings/users/me" }))}
                />
              </li>
            )}
            {canSeeRolesArea(session) && (
              <li>
                <SectionLink
                  to="/settings/roles"
                  label="Roles"
                  icon={<Shield />}
                  active={Boolean(matchRoute({ to: "/settings/roles" }))}
                />
              </li>
            )}
            {canSeeRegistersArea(session) && (
              <li>
                <SectionLink
                  to="/settings/registers"
                  label="Cajas registradoras"
                  icon={<Laptop />}
                  active={Boolean(matchRoute({ to: "/settings/registers" }))}
                />
              </li>
            )}
            {canSeeBranchArea(session) && (
              <li>
                <SectionLink
                  to="/settings/branch"
                  label="Sucursal"
                  icon={<Store />}
                  active={Boolean(matchRoute({ to: "/settings/branch" }))}
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
