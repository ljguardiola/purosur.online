import { createRoute, Outlet, redirect } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import { signedInRoute } from "./signed-in-route";

export const homeAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "home",
  component: HomeArea,
});

export const homeAreaIndexRoute = createRoute({
  getParentRoute: () => homeAreaRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/help" });
  },
});

function HomeArea() {
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
              <SectionLink to="/home/alerts" search label="Alertas" icon={<Bell />} active />
            </li>
          </ul>
        </>
      }
    >
      <Outlet />
    </AreaLayout>
  );
}
