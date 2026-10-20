import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import { AreaTopBarAlertsCount } from "./area-top-bar-alerts-count";
import { canManageSupplierPriceLists, canSeeAlertsArea } from "./backoffice-access";
import { signedInRoute } from "./signed-in-route";

export const ordersAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "orders-area",
  component: OrdersArea,
});

function OrdersArea() {
  const { session, services, sessionActions } = ordersAreaRoute.useRouteContext();
  const AlertsCount = services.areaTopBarAlertsCount;
  const matchRoute = useMatchRoute();
  const supplierPriceListsShown = Boolean(matchRoute({ to: "/supplier-price-lists", fuzzy: true }));
  return (
    <AreaLayout
      area="orders"
      sectionColumnLabel="Pedidos"
      sectionColumn={
        <>
          <h2 className="text-text-accent text-heading">Pedidos</h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            {canManageSupplierPriceLists(session) && (
              <li>
                <SectionLink
                  to="/supplier-price-lists"
                  label="Listas de proveedores"
                  icon={<FileText />}
                  search={supplierPriceListsShown ? true : {}}
                  active={supplierPriceListsShown}
                />
              </li>
            )}
          </ul>
        </>
      }
    >
      <AreaTopBarAlertsCount
        value={
          canSeeAlertsArea(session) ? (
            <AlertsCount
              onSessionEnded={sessionActions.sessionEnded}
              services={services.alertsOpenCountLink}
            />
          ) : null
        }
      >
        <Outlet />
      </AreaTopBarAlertsCount>
    </AreaLayout>
  );
}
