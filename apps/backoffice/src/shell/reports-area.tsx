import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { ChartColumn, List, Wallet } from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import { canSeeReports } from "./backoffice-access";
import { lazyScreen } from "./lazy-screen";
import { refuseWithout, signedInRoute } from "./signed-in-route";

export const reportsAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "reports-area",
  component: ReportsArea,
});

export const reportsIndexRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  component: lazyScreen(() => import("./reports-index-page"), "ReportsIndexPage"),
});

function ReportsArea() {
  const matchRoute = useMatchRoute();
  const salesByDayShown = Boolean(matchRoute({ to: "/reports/sales-by-day" }));
  const salesByPaymentMethodShown = Boolean(matchRoute({ to: "/reports/sales-by-payment-method" }));
  return (
    <AreaLayout
      area="reports"
      sectionColumnLabel="Reportes"
      sectionColumn={
        <>
          <h2 className="text-text-accent text-heading">Reportes</h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            <li>
              <SectionLink
                to="/reports"
                label="Todos los reportes"
                icon={<List />}
                active={Boolean(matchRoute({ to: "/reports" }))}
              />
            </li>
            <li>
              <SectionLink
                to="/reports/sales-by-day"
                label="Ventas por día o por rango"
                icon={<ChartColumn />}
                search={salesByDayShown ? true : {}}
                active={salesByDayShown}
              />
            </li>
            <li>
              <SectionLink
                to="/reports/sales-by-payment-method"
                label="Ventas por medio de pago"
                icon={<Wallet />}
                search={salesByPaymentMethodShown ? true : {}}
                active={salesByPaymentMethodShown}
              />
            </li>
          </ul>
        </>
      }
    >
      <Outlet />
    </AreaLayout>
  );
}
