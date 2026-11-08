import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import { canSeeStockPage } from "./backoffice-access";
import { signedInRoute } from "./signed-in-route";

export const stockAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "stock-area",
  component: StockArea,
});

function StockArea() {
  const { session } = stockAreaRoute.useRouteContext();
  const matchRoute = useMatchRoute();
  const stockShown = Boolean(matchRoute({ to: "/stock" }));
  const stockActive = Boolean(matchRoute({ to: "/stock", fuzzy: true }));
  return (
    <AreaLayout
      area="stock"
      sectionColumnLabel="Stock"
      sectionColumn={
        <>
          <h2 className="text-text-accent text-heading">Stock</h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            {canSeeStockPage(session) && (
              <li>
                <SectionLink
                  to="/stock"
                  label="Stock"
                  icon={<Boxes />}
                  search={stockShown ? true : {}}
                  active={stockActive}
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
