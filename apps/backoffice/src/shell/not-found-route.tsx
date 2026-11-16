import { createRoute, Outlet } from "@tanstack/react-router";
import { AreaLayout } from "./area-layout";
import { lazyScreen } from "./lazy-screen";
import { signedInRoute } from "./signed-in-route";

export const notFoundAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "not-found-area",
  component: NotFoundArea,
});

export const notFoundRoute = createRoute({
  getParentRoute: () => notFoundAreaRoute,
  path: "$",
  component: lazyScreen(() => import("./not-found-page"), "NotFoundPage"),
});

function NotFoundArea() {
  return (
    <AreaLayout area={null}>
      <Outlet />
    </AreaLayout>
  );
}
