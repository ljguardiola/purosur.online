import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { Boxes, Container, ShoppingCart, Truck } from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import {
  canManageFreights,
  canManageSuppliers,
  canRecordPurchases,
  canSeeStockPage,
} from "./backoffice-access";
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
  const suppliersShown = Boolean(matchRoute({ to: "/suppliers" }));
  const purchasesShown = Boolean(matchRoute({ to: "/purchases", fuzzy: true }));
  const freightsShown = Boolean(matchRoute({ to: "/freights" }));
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
            {canManageSuppliers(session) && (
              <li>
                <SectionLink
                  to="/suppliers"
                  label="Proveedores"
                  icon={<Truck />}
                  search={suppliersShown ? true : {}}
                  active={suppliersShown}
                />
              </li>
            )}
            {canRecordPurchases(session) && (
              <li>
                <SectionLink
                  to="/purchases"
                  label="Compras"
                  icon={<ShoppingCart />}
                  search={purchasesShown ? true : {}}
                  active={purchasesShown}
                />
              </li>
            )}
            {canManageFreights(session) && (
              <li>
                <SectionLink
                  to="/freights"
                  label="Flete"
                  icon={<Container />}
                  search={freightsShown ? true : {}}
                  active={freightsShown}
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
