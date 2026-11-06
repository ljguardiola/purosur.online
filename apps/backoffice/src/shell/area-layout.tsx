import { AreaNavItem, SectionNavItem } from "@purosur/ui";
import { createLink, useMatchRoute, useNavigate } from "@tanstack/react-router";
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
import { type ReactNode, Suspense } from "react";
import { AccountFooter } from "./account-footer";
import { AreaTopBarUnbilledDeferredSales } from "./area-top-bar-unbilled-deferred-sales";
import {
  canComparePrices,
  canManageBatches,
  canManageFreights,
  canManageProductsAndCategories,
  canManageRecipes,
  canManageSupplierPriceLists,
  canManageSuppliers,
  canPerformStockCounts,
  canReadPurchaseOrders,
  canRecordPurchases,
  canSeeBackupsArea,
  canSeeBranchArea,
  canSeeCatalogArea,
  canSeeContingencyTicketRescue,
  canSeeExpiringLots,
  canSeeFiscalConfigurationArea,
  canSeeFiscalInformation,
  canSeeOrdersArea,
  canSeePeopleArea,
  canSeePricesArea,
  canSeeQuarantinedEvents,
  canSeeRefundsArea,
  canSeeRegistersArea,
  canSeeReports,
  canSeeReturnsReport,
  canSeeStockArea,
  canSeeStockBalances,
  canSeeStockMovements,
} from "./backoffice-access";
import { lazyScreen } from "./lazy-screen";
import { Shell } from "./shell";
import { signedInRoute } from "./signed-in-route";

const AreaLink = createLink(AreaNavItem);

const OwnAccountPanel = lazyScreen(() => import("./own-account-panel"), "OwnAccountPanel");

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

export function AreaLayout({
  area,
  sectionColumnLabel,
  sectionColumn,
  children,
}: AreaLayoutProps) {
  const { session, services, sessionActions } = signedInRoute.useRouteContext();
  const { account } = signedInRoute.useSearch();
  const navigate = useNavigate();
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
  const cashTarget = canSeeFiscalConfigurationArea(session)
    ? "/points-of-sale"
    : canSeeRefundsArea(session)
      ? "/refunds/mercado-pago"
      : "/fiscal-tasks";
  const reportsTarget = canSeeReports(session) ? "/reports" : "/reports/returns";
  const ordersTarget = canManageSupplierPriceLists(session)
    ? "/supplier-price-lists"
    : canComparePrices(session)
      ? "/price-comparison"
      : canReadPurchaseOrders(session)
        ? "/purchase-orders"
        : "/supplier-price-lists";
  const settingsTarget = canSeePeopleArea(session)
    ? "/people"
    : canSeeRegistersArea(session)
      ? "/registers"
      : canSeeBackupsArea(session)
        ? "/backups"
        : canSeeContingencyTicketRescue(session)
          ? "/contingency-ticket-rescue"
          : canSeeBranchArea(session)
            ? "/location-settings"
            : canSeeQuarantinedEvents(session)
              ? "/quarantined-events"
              : null;
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
              to={ordersTarget}
              label="Pedidos"
              icon={<ClipboardList />}
              active={area === "orders"}
            />
          )}
          {(canSeeFiscalConfigurationArea(session) ||
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
          {settingsTarget === null ? (
            <AreaLink
              to="/"
              search={{ account: "credentials" }}
              label="Config"
              icon={<Settings />}
              active={area === "settings"}
            />
          ) : (
            <AreaLink
              to={settingsTarget}
              label="Config"
              icon={<Settings />}
              active={area === "settings"}
            />
          )}
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
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
          {account === undefined ? null : (
            <Suspense fallback={null}>
              <OwnAccountPanel
                tab={account}
                onClose={() =>
                  void navigate({
                    to: ".",
                    search: (previous) => ({ ...previous, account: undefined }),
                  })
                }
              />
            </Suspense>
          )}
        </div>
      </AreaTopBarUnbilledDeferredSales>
    </Shell>
  );
}
