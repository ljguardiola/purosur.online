import { AreaNavItem, SectionNavItem } from "@purosur/ui";
import { createLink, useMatchRoute, useNavigate } from "@tanstack/react-router";
import {
  Boxes,
  ChartColumn,
  ClipboardList,
  HandCoins,
  Home,
  Landmark,
  LifeBuoy,
  Package,
  Settings,
} from "lucide-react";
import { type ReactNode, Suspense } from "react";
import { AccountFooter } from "./account-footer";
import { AreaTopBarUnbilledDeferredSales } from "./area-top-bar-unbilled-deferred-sales";
import {
  canSeeBranchArea,
  canSeeFiscalInformation,
  canSeeFiscalPage,
  canSeePeopleArea,
  canSeeProductsPage,
  canSeePurchaseOrdersPage,
  canSeePurchasingArea,
  canSeeQuarantinedEvents,
  canSeeRefundsArea,
  canSeeRefundsPage,
  canSeeRegistersPage,
  canSeeReportsPage,
  canSeeStockArea,
  canSeeSuppliersPage,
} from "./backoffice-access";
import { lazyScreen } from "./lazy-screen";
import { Shell } from "./shell";
import { signedInRoute } from "./signed-in-route";

const AreaLink = createLink(AreaNavItem);

const OwnAccountPanel = lazyScreen(() => import("./own-account-panel"), "OwnAccountPanel");

export const SectionLink = createLink(SectionNavItem);

type Area =
  | "home"
  | "products"
  | "stock"
  | "purchasing"
  | "sales-and-cash"
  | "fiscal"
  | "reports"
  | "settings"
  | "help";

export type AreaLayoutProps = {
  area: Area;
  sectionColumnLabel?: string | undefined;
  sectionColumn?: ReactNode;
  children: ReactNode;
};

export function AreaLayout({ area, sectionColumnLabel, sectionColumn, children }: AreaLayoutProps) {
  const { session, services, sessionActions } = signedInRoute.useRouteContext();
  const { account } = signedInRoute.useSearch();
  const navigate = useNavigate();
  const UnbilledDeferredSales = services.areaTopBarUnbilledDeferredSales;
  const matchRoute = useMatchRoute();
  const productsShown = Boolean(matchRoute({ to: "/products" }));
  const salesAndCashTarget = canSeeRegistersPage(session)
    ? "/registers"
    : canSeeRefundsArea(session)
      ? "/refunds"
      : "/refunds/history";
  const purchasingTarget = canSeeSuppliersPage(session)
    ? "/suppliers"
    : canSeePurchaseOrdersPage(session)
      ? "/purchase-orders"
      : "/purchases";
  const settingsTarget = canSeePeopleArea(session)
    ? "/people"
    : canSeeBranchArea(session)
      ? "/location-settings"
      : canSeeQuarantinedEvents(session)
        ? "/quarantined-events"
        : null;
  const stockShown = Boolean(matchRoute({ to: "/stock" }));
  return (
    <Shell
      sectionColumnLabel={sectionColumnLabel}
      railAreas={
        <>
          <AreaLink to="/" label="Inicio" icon={<Home />} active={area === "home"} />
          {(canSeeRefundsPage(session) || canSeeRegistersPage(session)) && (
            <AreaLink
              to={salesAndCashTarget}
              label="Ventas y caja"
              icon={<HandCoins />}
              active={area === "sales-and-cash"}
            />
          )}
          {canSeeProductsPage(session) && (
            <AreaLink
              to="/products"
              search={productsShown ? true : {}}
              label="Productos"
              icon={<Package />}
              active={area === "products"}
            />
          )}
          {canSeeStockArea(session) && (
            <AreaLink
              to="/stock"
              search={stockShown ? true : {}}
              label="Stock"
              icon={<Boxes />}
              active={area === "stock"}
            />
          )}
          {canSeePurchasingArea(session) && (
            <AreaLink
              to={purchasingTarget}
              label="Compras"
              icon={<ClipboardList />}
              active={area === "purchasing"}
            />
          )}
          {canSeeFiscalPage(session) && (
            <AreaLink to="/fiscal" label="Fiscal" icon={<Landmark />} active={area === "fiscal"} />
          )}
          {canSeeReportsPage(session) && (
            <AreaLink
              to="/reports"
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
