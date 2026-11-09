import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { PackageCheck, ShoppingCart, Truck } from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import {
  canSeePurchaseOrdersPage,
  canSeePurchasesPage,
  canSeeSuppliersPage,
} from "./backoffice-access";
import { signedInRoute } from "./signed-in-route";

export const purchasingAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "purchasing-area",
  component: PurchasingArea,
});

function PurchasingArea() {
  const { session } = purchasingAreaRoute.useRouteContext();
  const matchRoute = useMatchRoute();
  const suppliersShown = Boolean(matchRoute({ to: "/suppliers" }));
  const suppliersActive =
    Boolean(matchRoute({ to: "/suppliers", fuzzy: true })) ||
    Boolean(matchRoute({ to: "/supplier-price-lists", fuzzy: true }));
  const purchaseOrdersShown = Boolean(matchRoute({ to: "/purchase-orders" }));
  const purchaseOrdersActive = Boolean(matchRoute({ to: "/purchase-orders", fuzzy: true }));
  const purchasesShown = Boolean(matchRoute({ to: "/purchases" }));
  const purchasesActive = Boolean(matchRoute({ to: "/purchases", fuzzy: true }));
  return (
    <AreaLayout
      area="purchasing"
      sectionColumnLabel="Compras"
      sectionColumn={
        <>
          <h2 className="text-text-accent text-heading">Compras</h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            {canSeeSuppliersPage(session) && (
              <li>
                <SectionLink
                  to="/suppliers"
                  label="Proveedores"
                  icon={<Truck />}
                  search={suppliersShown ? true : {}}
                  active={suppliersActive}
                />
              </li>
            )}
            {canSeePurchaseOrdersPage(session) && (
              <li>
                <SectionLink
                  to="/purchase-orders"
                  label="Pedidos"
                  icon={<PackageCheck />}
                  search={purchaseOrdersShown ? true : {}}
                  active={purchaseOrdersActive}
                />
              </li>
            )}
            {canSeePurchasesPage(session) && (
              <li>
                <SectionLink
                  to="/purchases"
                  label="Compras"
                  icon={<ShoppingCart />}
                  search={purchasesShown ? true : {}}
                  active={purchasesActive}
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
