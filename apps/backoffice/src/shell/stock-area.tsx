import { createRoute, Outlet, redirect, useMatchRoute } from "@tanstack/react-router";
import { ArrowDownUp, ClipboardCheck, Scale } from "lucide-react";
import {
  canPerformStockCounts,
  canSeeStockBalances,
  canSeeStockMovements,
} from "../access/backoffice-access";
import { AreaLayout, SectionLink } from "./area-layout";
import { signedInRoute } from "./signed-in-route";

export const stockAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "stock",
  component: StockArea,
});

export const stockAreaIndexRoute = createRoute({
  getParentRoute: () => stockAreaRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/help" });
  },
});

function StockArea() {
  const { session } = stockAreaRoute.useRouteContext();
  const matchRoute = useMatchRoute();
  const balancesShown = Boolean(matchRoute({ to: "/stock/balances" }));
  const countsShown = Boolean(matchRoute({ to: "/stock/counts" }));
  const movementsShown = Boolean(matchRoute({ to: "/stock/adjustments-and-losses" }));
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
                  to="/stock/balances"
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
                  to="/stock/counts"
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
                  to="/stock/adjustments-and-losses"
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
