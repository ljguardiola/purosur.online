import { AreaNavItem, SectionNavItem } from "@purosur/ui";
import { createLink, useMatchRoute } from "@tanstack/react-router";
import { Boxes, Home, LifeBuoy, Package, Settings, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { AccountFooter } from "./account-footer";
import {
  canManageProductsAndCategories,
  canPerformStockCounts,
  canSeeCashArea,
  canSeeCatalogArea,
  canSeePricesArea,
  canSeeStockArea,
  canSeeStockBalances,
} from "./backoffice-access";
import { Shell } from "./shell";
import { signedInRoute } from "./signed-in-route";

const AreaLink = createLink(AreaNavItem);

export const SectionLink = createLink(SectionNavItem);

type Area = "home" | "catalog" | "stock" | "cash-and-fiscal" | "settings" | "help";

export type AreaLayoutProps = {
  area: Area;
  sectionColumnLabel: string;
  sectionColumn: ReactNode;
  children: ReactNode;
};

export function AreaLayout({ area, sectionColumnLabel, sectionColumn, children }: AreaLayoutProps) {
  const { session, services, sessionActions } = signedInRoute.useRouteContext();
  const matchRoute = useMatchRoute();
  const catalogTarget = canManageProductsAndCategories(session)
    ? "/products"
    : canSeePricesArea(session)
      ? "/prices"
      : "/discounts";
  const catalogTargetShown = Boolean(matchRoute({ to: catalogTarget }));
  const stockTarget = canSeeStockBalances(session)
    ? "/inventory"
    : canPerformStockCounts(session)
      ? "/inventory-counts"
      : "/inventory-adjustments";
  const stockTargetShown = Boolean(matchRoute({ to: stockTarget }));
  return (
    <Shell
      sectionColumnLabel={sectionColumnLabel}
      railAreas={
        <>
          <AreaLink to="/" label="Inicio" icon={<Home />} active={area === "home"} />
          {canSeeCatalogArea(session) && (
            <AreaLink
              to={catalogTarget}
              search={catalogTargetShown ? true : {}}
              label="Catálogo"
              icon={<Package />}
              active={area === "catalog"}
            />
          )}
          {canSeeStockArea(session) && (
            <AreaLink
              to={stockTarget}
              search={stockTargetShown ? true : {}}
              label="Stock"
              icon={<Boxes />}
              active={area === "stock"}
            />
          )}
          {canSeeCashArea(session) && (
            <AreaLink
              to="/points-of-sale"
              label="Caja"
              icon={<Wallet />}
              active={area === "cash-and-fiscal"}
            />
          )}
          <AreaLink to="/account" label="Config" icon={<Settings />} active={area === "settings"} />
        </>
      }
      railFooter={
        <>
          <AreaLink to="/help" label="Ayuda" icon={<LifeBuoy />} active={area === "help"} />
          <AccountFooter
            displayName={session.displayName}
            onSignedOut={sessionActions.signedOut}
            services={services.accountFooter}
          />
        </>
      }
      sectionColumn={sectionColumn}
    >
      {children}
    </Shell>
  );
}
