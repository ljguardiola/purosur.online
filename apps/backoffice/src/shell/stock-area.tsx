import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { ArrowDownUp, ClipboardCheck, Package, Scale, ShoppingCart, Truck } from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import {
  canManagePurchasePackagings,
  canManageSuppliers,
  canPerformStockCounts,
  canRecordPurchases,
  canSeeStockBalances,
  canSeeStockMovements,
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
  const balancesShown = Boolean(matchRoute({ to: "/inventory" }));
  const countsShown = Boolean(matchRoute({ to: "/inventory-counts" }));
  const movementsShown = Boolean(matchRoute({ to: "/inventory-adjustments" }));
  const suppliersShown = Boolean(matchRoute({ to: "/suppliers" }));
  const packagingsShown = Boolean(matchRoute({ to: "/purchase-packagings" }));
  const purchasesShown = Boolean(matchRoute({ to: "/purchases", fuzzy: true }));
  return (
    <AreaLayout
      area="stock"
      sectionColumnLabel="Stock"
      sectionColumn={
        <>
          <h2 className="text-text-accent text-heading">Stock</h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            {canSeeStockBalances(session) && (
              <li>
                <SectionLink
                  to="/inventory"
                  label="Saldos"
                  icon={<Scale />}
                  search={balancesShown ? true : {}}
                  active={balancesShown}
                />
              </li>
            )}
            {canPerformStockCounts(session) && (
              <li>
                <SectionLink
                  to="/inventory-counts"
                  label="Recuentos"
                  icon={<ClipboardCheck />}
                  search={countsShown ? true : {}}
                  active={countsShown}
                />
              </li>
            )}
            {canSeeStockMovements(session) && (
              <li>
                <SectionLink
                  to="/inventory-adjustments"
                  label="Ajustes y pérdidas"
                  icon={<ArrowDownUp />}
                  search={movementsShown ? true : {}}
                  active={movementsShown}
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
            {canManagePurchasePackagings(session) && (
              <li>
                <SectionLink
                  to="/purchase-packagings"
                  label="Presentaciones de compra"
                  icon={<Package />}
                  search={packagingsShown ? true : {}}
                  active={packagingsShown}
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
          </ul>
        </>
      }
    >
      <Outlet />
    </AreaLayout>
  );
}
