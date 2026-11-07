import { createRoute, Outlet } from "@tanstack/react-router";
import { AreaLayout } from "./area-layout";
import { signedInRoute } from "./signed-in-route";

export const homeAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "home-area",
  component: HomeArea,
});

function HomeArea() {
  return (
    <AreaLayout area="home">
      <Outlet />
    </AreaLayout>
  );
}
