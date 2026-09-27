import { createRoute, Outlet, redirect } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import { signedInRoute } from "./signed-in-route";

export const cashAndFiscalAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "cash-and-fiscal",
  component: CashAndFiscalArea,
});

export const cashAndFiscalAreaIndexRoute = createRoute({
  getParentRoute: () => cashAndFiscalAreaRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/help" });
  },
});

function CashAndFiscalArea() {
  return (
    <AreaLayout
      area="cash-and-fiscal"
      sectionColumnLabel="Caja y fiscal"
      sectionColumn={
        <>
          <h2 className="font-bold text-brand-blue-strong text-xl">Caja y fiscal</h2>
          <div className="h-2.5" />
          <p className="px-3 pt-3 pb-1 font-bold text-ink-secondary text-xs tracking-[1px]">
            FISCAL
          </p>
          <ul className="flex flex-col gap-1">
            <li>
              <SectionLink
                to="/cash-and-fiscal/fiscal-configuration"
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
