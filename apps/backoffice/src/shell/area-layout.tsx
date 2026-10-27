import { AreaNavItem, SectionNavItem } from "@purosur/ui";
import { createLink, useMatchRoute } from "@tanstack/react-router";
import {
  Boxes,
  ChartColumn,
  ClipboardList,
  Home,
  LifeBuoy,
  Package,
  Settings,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { AccountFooter } from "./account-footer";
import { AreaTopBarUnbilledDeferredSales } from "./area-top-bar-unbilled-deferred-sales";
import {
  canManageBatches,
  canManageFreights,
  canManageProductsAndCategories,
  canManagePurchasePackagings,
  canManageRecipes,
  canManageSuppliers,
  canPerformStockCounts,
  canRecordPurchases,
  canSeeCashArea,
  canSeeCatalogArea,
  canSeeExpiringLots,
  canSeeFiscalInformation,
  canSeeOrdersArea,
  canSeePricesArea,
  canSeeRefundsArea,
  canSeeReports,
  canSeeReturnsReport,
  canSeeStockArea,
  canSeeStockBalances,
  canSeeStockMovements,
} from "./backoffice-access";
import { Shell } from "./shell";
import { signedInRoute } from "./signed-in-route";

const AreaLink = createLink(AreaNavItem);

export const SectionLink = createLink(SectionNavItem);

type Area =
  | "home"
  | "catalog"
  | "stock"
  | "orders"
  | "cash-and-fiscal"
  | "reports"
  | "settings"
  | "help";

export type AreaLayoutProps = {
  area: Area;
  sectionColumnLabel: string;
  sectionColumn: ReactNode;
  children: ReactNode;
};

export function AreaLayout({ area, sectionColumnLabel, sectionColumn, children }: AreaLayoutProps) {
  const { session, services, sessionActions } = signedInRoute.useRouteContext();
  const UnbilledDeferredSales = services.areaTopBarUnbilledDeferredSales;
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
      : canSeeStockMovements(session)
        ? "/inventory-adjustments"
        : canManageSuppliers(session)
          ? "/suppliers"
          : canManagePurchasePackagings(session)
            ? "/purchase-packagings"
            : canRecordPurchases(session)
              ? "/purchases"
              : canSeeExpiringLots(session)
                ? "/expiring-lots"
                : canManageFreights(session)
                  ? "/freights"
                  : canManageRecipes(session)
                    ? "/recipes"
                    : canManageBatches(session)
                      ? "/assembly-batches"
                      : "/initial-inventory";
  const cashTarget = canSeeCashArea(session)
    ? "/points-of-sale"
    : canSeeRefundsArea(session)
      ? "/refunds/mercado-pago"
      : "/fiscal-tasks";
  const reportsTarget = canSeeReports(session) ? "/reports" : "/reports/returns";
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
          {canSeeOrdersArea(session) && (
            <AreaLink
              to="/supplier-price-lists"
              label="Pedidos"
              icon={<ClipboardList />}
              active={area === "orders"}
            />
          )}
          {(canSeeCashArea(session) ||
            canSeeRefundsArea(session) ||
            canSeeFiscalInformation(session)) && (
            <AreaLink
              to={cashTarget}
              label="Caja"
              icon={<Wallet />}
              active={area === "cash-and-fiscal"}
            />
          )}
          {(canSeeReports(session) || canSeeReturnsReport(session)) && (
            <AreaLink
              to={reportsTarget}
              label="Reportes"
              icon={<ChartColumn />}
              active={area === "reports"}
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
      <AreaTopBarUnbilledDeferredSales
        value={
          canSeeFiscalInformation(session) ? (
            <UnbilledDeferredSales
              onSessionEnded={sessionActions.sessionEnded}
              services={services.unbilledDeferredSalesPill}
            />
          ) : null
        }
      >
        {children}
      </AreaTopBarUnbilledDeferredSales>
    </Shell>
  );
}
