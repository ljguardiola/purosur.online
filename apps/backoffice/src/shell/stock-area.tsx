import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { ArrowDownUp, ClipboardCheck, Scale } from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import {
  canPerformStockCounts,
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
          </ul>
        </>
      }
    >
      <Outlet />
    </AreaLayout>
  );
}
