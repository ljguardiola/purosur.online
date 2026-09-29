import { AreaNavItem, SectionNavItem } from "@purosur/ui";
import { createLink, useMatchRoute } from "@tanstack/react-router";
import { Home, LifeBuoy, Package, Settings, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import {
  canManageProductsAndCategories,
  canSeeCashArea,
  canSeeCatalogArea,
} from "../access/backoffice-access";
import { AccountFooter } from "./account-footer";
import { Shell } from "./shell";
import { signedInRoute } from "./signed-in-route";

const AreaLink = createLink(AreaNavItem);

export const SectionLink = createLink(SectionNavItem);

type Area = "home" | "catalog" | "cash-and-fiscal" | "settings" | "help";

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
    ? "/catalog/products"
    : "/catalog/prices";
  const catalogTargetShown = Boolean(matchRoute({ to: catalogTarget }));
  return (
    <Shell
      sectionColumnLabel={sectionColumnLabel}
      railAreas={
        <>
          <AreaLink to="/home" label="Inicio" icon={<Home />} active={area === "home"} />
          {canSeeCatalogArea(session) && (
            <AreaLink
              to={catalogTarget}
              search={catalogTargetShown ? true : {}}
              label="Catálogo"
              icon={<Package />}
              active={area === "catalog"}
            />
          )}
          {canSeeCashArea(session) && (
            <AreaLink
              to="/cash-and-fiscal/fiscal-configuration"
              label="Caja"
              icon={<Wallet />}
              active={area === "cash-and-fiscal"}
            />
          )}
          <AreaLink
            to="/settings/users/me"
            label="Config"
            icon={<Settings />}
            active={area === "settings"}
          />
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
