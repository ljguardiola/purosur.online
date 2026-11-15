import { createRoute, Outlet } from "@tanstack/react-router";
import { AreaLayout } from "./area-layout";
import { signedInRoute } from "./signed-in-route";

export const reportsAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "reports-area",
  component: ReportsArea,
});

function ReportsArea() {
  return (
    <AreaLayout area="reports">
      <Outlet />
    </AreaLayout>
  );
}
