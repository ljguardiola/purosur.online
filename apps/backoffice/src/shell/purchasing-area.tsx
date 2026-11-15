import { createRoute, Outlet } from "@tanstack/react-router";
import { PURCHASING_TABS } from "../purchasing/purchasing-area-tabs";
import { AreaLayout } from "./area-layout";
import { visibleAreaTabs } from "./area-tabs";
import { signedInRoute } from "./signed-in-route";

export const purchasingAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "purchasing-area",
  beforeLoad: ({ context: { session } }) => ({
    purchasingTabs: visibleAreaTabs(PURCHASING_TABS, session),
  }),
  component: PurchasingArea,
});

function PurchasingArea() {
  return (
    <AreaLayout area="purchasing">
      <Outlet />
    </AreaLayout>
  );
}
