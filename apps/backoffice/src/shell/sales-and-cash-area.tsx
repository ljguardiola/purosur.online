import { createRoute, Outlet } from "@tanstack/react-router";
import { AreaLayout } from "./area-layout";
import { visibleAreaTabs } from "./area-tabs";
import { SALES_AND_CASH_TABS } from "./sales-and-cash-tabs";
import { signedInRoute } from "./signed-in-route";

export const salesAndCashAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "sales-and-cash-area",
  beforeLoad: ({ context: { session } }) => ({
    salesAndCashTabs: visibleAreaTabs(SALES_AND_CASH_TABS, session),
  }),
  component: SalesAndCashArea,
});

function SalesAndCashArea() {
  return (
    <AreaLayout area="sales-and-cash">
      <Outlet />
    </AreaLayout>
  );
}
