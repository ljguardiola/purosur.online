import { createRoute, Outlet } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import { signedInRoute } from "./signed-in-route";

export const cashAndFiscalAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "cash-and-fiscal-area",
  component: CashAndFiscalArea,
});

function CashAndFiscalArea() {
  return (
    <AreaLayout
      area="cash-and-fiscal"
      sectionColumnLabel="Caja y fiscal"
      sectionColumn={
        <>
          <h2 className="text-text-accent text-heading">Caja y fiscal</h2>
          <div className="h-2.5" />
          <p className="px-3 pt-3 pb-1 font-bold text-text-subtle text-caption tracking-xs">
            FISCAL
          </p>
          <ul className="flex flex-col gap-1">
            <li>
              <SectionLink
                to="/fiscal-settings"
                label="Configuración fiscal"
                icon={<SlidersHorizontal />}
                active
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
