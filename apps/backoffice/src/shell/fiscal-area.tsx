import { createRoute, Outlet } from "@tanstack/react-router";
import { AreaLayout } from "./area-layout";
import { signedInRoute } from "./signed-in-route";

export const fiscalAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "fiscal-area",
  component: FiscalArea,
});

function FiscalArea() {
  return (
    <AreaLayout area="fiscal">
      <Outlet />
    </AreaLayout>
  );
}
