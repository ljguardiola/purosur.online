import { createRoute, Outlet } from "@tanstack/react-router";
import { AreaLayout } from "./area-layout";
import { signedInRoute } from "./signed-in-route";

export const helpAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "help",
  component: HelpArea,
});

function HelpArea() {
  return (
    <AreaLayout area="help">
      <Outlet />
    </AreaLayout>
  );
}
