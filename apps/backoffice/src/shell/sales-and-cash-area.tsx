import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { Laptop, Undo2 } from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import { canSeeRefundsPage, canSeeRegistersPage } from "./backoffice-access";
import { signedInRoute } from "./signed-in-route";

export const salesAndCashAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "sales-and-cash-area",
  component: SalesAndCashArea,
});

function SalesAndCashArea() {
  const { session } = signedInRoute.useRouteContext();
  const matchRoute = useMatchRoute();
  return (
    <AreaLayout
      area="sales-and-cash"
      sectionColumnLabel="Ventas y caja"
      sectionColumn={
        <>
          <h2 className="text-text-accent text-heading">Ventas y caja</h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            {canSeeRegistersPage(session) && (
              <li>
                <SectionLink
                  to="/registers"
                  label="Cajas"
                  icon={<Laptop />}
                  active={Boolean(matchRoute({ to: "/registers", fuzzy: true }))}
                />
              </li>
            )}
            {canSeeRefundsPage(session) && (
              <li>
                <SectionLink
                  to="/refunds"
                  label="Devoluciones y reembolsos"
                  icon={<Undo2 />}
                  active={Boolean(matchRoute({ to: "/refunds", fuzzy: true }))}
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
