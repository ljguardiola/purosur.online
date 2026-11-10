import { FieldSizeProvider, LocaleProvider } from "@purosur/ui";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { type ComponentType, useEffect, useState } from "react";
import type { ContingencyTicketRescueModalServices } from "../backups/contingency-ticket-rescue-modal";
import type { BranchSettingsScreenServices } from "../branch/branch-settings-services";
import type { BrandsListScreenServices } from "../catalog/brands-list-services";
import type { CategoriesListScreenServices } from "../catalog/categories-list-services";
import type { ProductsListScreenServices } from "../catalog/products-list-services";
import type { TagsListScreenServices } from "../catalog/tags-list-services";
import type { AccountRecoveryScreenServices } from "../credentials/account-recovery-services";
import type { OwnCredentialsSectionServices } from "../credentials/own-credentials-section-services";
import type { RegisterPasskeyScreenServices } from "../credentials/register-passkey-services";
import type { UserCredentialSectionsServices } from "../credentials/user-credential-sections-services";
import type { CaeaScreenServices } from "../fiscal/caea-services";
import type { FiscalSettingsScreenServices } from "../fiscal/fiscal-settings-services";
import type { FiscalStatusStripServices } from "../fiscal/fiscal-status-strip-services";
import type { FiscalTasksScreenServices } from "../fiscal/fiscal-tasks-services";
import type { IssuedFiscalDocumentsScreenServices } from "../fiscal/issued-fiscal-documents-services";
import type { UnbilledDeferredSalesPillProps } from "../fiscal/unbilled-deferred-sales-pill";
import type { UnbilledDeferredSalesPillServices } from "../fiscal/unbilled-deferred-sales-pill-services";
import type { BackofficeHelpCatalog } from "../help/help-catalog";
import type { RegistersListScreenServices } from "../installation/registers-list-services";
import type { ReportRegisterFilterProps } from "../installation/report-register-filter";
import type { ReportRegisterFilterServices } from "../installation/report-register-filter-services";
import type { MercadoPagoChargeCostsScreenServices } from "../payments/mercado-pago-charge-costs-services";
import type { PendingRefundsScreenServices } from "../payments/pending-refunds-services";
import type { SalesByPaymentMethodScreenServices } from "../payments/sales-by-payment-method-services";
import type { RolesListScreenServices } from "../permissions/roles-list-services";
import type { ContingencyTicketRescueAssistant } from "../platform/contingency-ticket-rescue-assistant";
import type {
  CategoryCreationModal,
  ProductCreationModal,
  RoleCreationModal,
} from "../platform/creation-parts";
import type { ProductPanelSections } from "../platform/product-panel-sections";
import type { ProductPriceSection } from "../platform/product-price-section";
import { createQueryClient } from "../platform/query-client";
import type { RegisterKeyModals } from "../platform/register-key-modals";
import type { RegisterPanelSections } from "../platform/register-panel-sections";
import type { RegisterPaymentModals } from "../platform/register-payment-modals";
import type { RegisterPointOfSaleSection } from "../platform/register-point-of-sale-section";
import {
  defaultReleaseMonitor,
  type ReleaseMonitor,
  ReleaseMonitorContext,
} from "../platform/release-monitor";
import type { DiscountsListScreenServices } from "../pricing/discounts-list-services";
import type { PricesListScreenServices } from "../pricing/prices-list-services";
import type { AiCostReportScreenServices } from "../purchasing/ai-cost-report-services";
import type { FreightsListScreenServices } from "../purchasing/freights-list-services";
import type { NewPurchaseScreenServices } from "../purchasing/new-purchase-services";
import type { OrderSuggestionScreenServices } from "../purchasing/order-suggestion-services";
import type { PurchaseOrderReceiveScreenServices } from "../purchasing/purchase-order-receive-services";
import type { PurchaseOrdersListScreenServices } from "../purchasing/purchase-orders-list-services";
import type { PurchasesListScreenServices } from "../purchasing/purchases-list-services";
import type { SupplierPriceComparisonScreenServices } from "../purchasing/supplier-price-comparison-services";
import type { SupplierPriceListReviewScreenServices } from "../purchasing/supplier-price-list-review-services";
import type { SupplierPriceListsScreenServices } from "../purchasing/supplier-price-lists-services";
import type { SuppliersListScreenServices } from "../purchasing/suppliers-list-services";
import type { CashMovementsScreenServices } from "../register/cash-movements-services";
import type { CashSessionClosesScreenServices } from "../register/cash-session-closes-services";
import type { ReturnsHistoryScreenServices } from "../returns/returns-history-services";
import type { AverageTicketScreenServices } from "../sales/average-ticket-services";
import type { CashRoundingScreenServices } from "../sales/cash-rounding-services";
import type { HandTypedWeightsScreenServices } from "../sales/hand-typed-weights-services";
import type { ManualDiscountsScreenServices } from "../sales/manual-discounts-services";
import type { SalesByCashierScreenServices } from "../sales/sales-by-cashier-services";
import type { SalesByDayScreenServices } from "../sales/sales-by-day-services";
import type { SalesByProductAndCategoryScreenServices } from "../sales/sales-by-product-and-category-services";
import type { SalesByPromotionScreenServices } from "../sales/sales-by-promotion-services";
import type { EndEverySessionSectionServices } from "../sessions/end-every-session-section-services";
import type { RespondToCompromiseModalServices } from "../sessions/respond-to-compromise-modal-services";
import { checkSessionStatus, fetchSession, type SessionOutcome } from "../sessions/session-api";
import type { SignInScreenServices } from "../sessions/sign-in-services";
import type { AssemblyBatchesScreenServices } from "../stock/assembly-batches-services";
import type { ExpiringLotsScreenServices } from "../stock/expiring-lots-services";
import type { MarginReportScreenServices } from "../stock/margin-report-services";
import type { RecipesListScreenServices } from "../stock/recipes-list-services";
import type { ReviewInitialInventoryModalServices } from "../stock/review-initial-inventory-modal-services";
import type { StockBalancesScreenServices } from "../stock/stock-balances-services";
import type { StockMovementsScreenServices } from "../stock/stock-movements-services";
import type { QuarantinedEventsScreenServices } from "../sync/quarantined-events-services";
import type { UserCredentialSectionsProps } from "../users/user-panel";
import type { UserPanelServices } from "../users/user-panel-services";
import type { UsersListEndEverySessionSectionProps } from "../users/users-list-screen";
import type { UsersListScreenServices } from "../users/users-list-services";
import { type AccountFooterServices, defaultAccountFooterServices } from "./account-footer";
import { createAppRouter } from "./app-router";
import type { BranchTermServices } from "./branch-term-services";
import type { HomeScreenServices } from "./home-screen-services";
import { LazyProductRecipeLookup } from "./lazy-product-recipe-lookup";
import { lazyScreen } from "./lazy-screen";
import { NewReleaseNotice } from "./new-release-notice";
import { useReleaseWatcher } from "./release-watcher";
import {
  SessionCheckPendingContext,
  type SettledSession,
  type SignedInSession,
} from "./root-route";
import { defaultScreenFailureServices, type ScreenFailureServices } from "./screen-failure";
import { useSessionActivityReporter } from "./session-activity-reporter";
import { clearSignedInMarker, markSignedIn, wasSignedIn } from "./session-marker";
import { useSessionWatcher } from "./session-watcher";

export type AppServices = {
  fetchSession: typeof fetchSession;
  checkSessionStatus: typeof checkSessionStatus;
  signInScreen: SignInScreenServices;
  accountRecoveryScreen: AccountRecoveryScreenServices;
  registerPasskeyScreen: RegisterPasskeyScreenServices;
  ownCredentialsSection: OwnCredentialsSectionServices;
  usersListScreen: UsersListScreenServices;
  userPanel: UserPanelServices;
  usersListEndEverySessionSection: ComponentType<UsersListEndEverySessionSectionProps>;
  endEverySessionSection: EndEverySessionSectionServices;
  respondToCompromiseModal: RespondToCompromiseModalServices;
  userPanelCredentialSections: ComponentType<UserCredentialSectionsProps>;
  userCredentialSections: UserCredentialSectionsServices;
  rolesListScreen: RolesListScreenServices;
  registersListScreen: RegistersListScreenServices;
  contingencyTicketRescueModal: ContingencyTicketRescueModalServices;
  branchSettingsScreen: BranchSettingsScreenServices;
  categoriesListScreen: CategoriesListScreenServices;
  brandsListScreen: BrandsListScreenServices;
  tagsListScreen: TagsListScreenServices;
  productsListScreen: ProductsListScreenServices;
  pricesListScreen: PricesListScreenServices;
  discountsListScreen: DiscountsListScreenServices;
  salesByDayScreen: SalesByDayScreenServices;
  salesByProductAndCategoryScreen: SalesByProductAndCategoryScreenServices;
  salesByCashierScreen: SalesByCashierScreenServices;
  handTypedWeightsScreen: HandTypedWeightsScreenServices;
  salesByPromotionScreen: SalesByPromotionScreenServices;
  manualDiscountsScreen: ManualDiscountsScreenServices;
  cashRoundingScreen: CashRoundingScreenServices;
  returnsHistoryScreen: ReturnsHistoryScreenServices;
  averageTicketScreen: AverageTicketScreenServices;
  salesByPaymentMethodScreen: SalesByPaymentMethodScreenServices;
  mercadoPagoChargeCostsScreen: MercadoPagoChargeCostsScreenServices;
  cashSessionClosesScreen: CashSessionClosesScreenServices;
  cashMovementsScreen: CashMovementsScreenServices;
  reportFiltersRegisterFilter: ComponentType<ReportRegisterFilterProps>;
  categoryCreationModal: CategoryCreationModal;
  productCreationModal: ProductCreationModal;
  productPriceSection: ProductPriceSection;
  productPanelSections: ProductPanelSections;
  registerPointOfSaleSection: RegisterPointOfSaleSection;
  registerPanelSections: RegisterPanelSections;
  registerPaymentModals: RegisterPaymentModals;
  registerKeyModals: RegisterKeyModals;
  contingencyTicketRescueAssistant: ContingencyTicketRescueAssistant;
  roleCreationModal: RoleCreationModal;
  reportRegisterFilter: ReportRegisterFilterServices;
  pendingRefundsScreen: PendingRefundsScreenServices;
  refundsBranchTerm: BranchTermServices;
  expiringLotsScreen: ExpiringLotsScreenServices;
  marginReportScreen: MarginReportScreenServices;
  stockBalancesScreen: StockBalancesScreenServices;
  stockMovementsScreen: StockMovementsScreenServices;
  suppliersListScreen: SuppliersListScreenServices;
  purchasesListScreen: PurchasesListScreenServices;
  aiCostReportScreen: AiCostReportScreenServices;
  freightsListScreen: FreightsListScreenServices;
  supplierPriceListsScreen: SupplierPriceListsScreenServices;
  supplierPriceListReviewScreen: SupplierPriceListReviewScreenServices;
  supplierPriceComparisonScreen: SupplierPriceComparisonScreenServices;
  orderSuggestionScreen: OrderSuggestionScreenServices;
  purchaseOrdersListScreen: PurchaseOrdersListScreenServices;
  purchaseOrderReceiveScreen: PurchaseOrderReceiveScreenServices;
  recipesListScreen: RecipesListScreenServices;
  assemblyBatchesScreen: AssemblyBatchesScreenServices;
  newPurchaseScreen: NewPurchaseScreenServices;
  reviewInitialInventoryModal: ReviewInitialInventoryModalServices;
  fiscalSettingsScreen: FiscalSettingsScreenServices;
  fiscalTasksScreen: FiscalTasksScreenServices;
  caeaScreen: CaeaScreenServices;
  issuedFiscalDocumentsScreen: IssuedFiscalDocumentsScreenServices;
  fiscalStatusStrip: FiscalStatusStripServices;
  accountFooter: AccountFooterServices;
  screenFailure: ScreenFailureServices;
  releaseMonitor: ReleaseMonitor;
  homeScreen: HomeScreenServices;
  areaTopBarUnbilledDeferredSales: ComponentType<UnbilledDeferredSalesPillProps>;
  unbilledDeferredSalesPill: UnbilledDeferredSalesPillServices;
  quarantinedEventsScreen: QuarantinedEventsScreenServices;
};

type ShellServiceName =
  | "fetchSession"
  | "checkSessionStatus"
  | "userPanelCredentialSections"
  | "usersListEndEverySessionSection"
  | "areaTopBarUnbilledDeferredSales"
  | "reportFiltersRegisterFilter"
  | "categoryCreationModal"
  | "productCreationModal"
  | "productPriceSection"
  | "productPanelSections"
  | "registerPointOfSaleSection"
  | "registerPanelSections"
  | "registerPaymentModals"
  | "registerKeyModals"
  | "contingencyTicketRescueAssistant"
  | "roleCreationModal"
  | "accountFooter"
  | "screenFailure"
  | "releaseMonitor";

export type RouteServices = Pick<AppServices, ShellServiceName> &
  Partial<Omit<AppServices, ShellServiceName>>;

const defaultRouteServices: RouteServices = {
  fetchSession,
  checkSessionStatus,
  usersListEndEverySessionSection: lazyScreen(
    () => import("../sessions/end-every-session-section"),
    "EndEverySessionSection",
  ),
  userPanelCredentialSections: lazyScreen(
    () => import("../credentials/user-credential-sections"),
    "UserCredentialSections",
  ),
  areaTopBarUnbilledDeferredSales: lazyScreen(
    () => import("../fiscal/unbilled-deferred-sales-pill"),
    "UnbilledDeferredSalesPill",
  ),
  reportFiltersRegisterFilter: lazyScreen(
    () => import("../installation/report-register-filter"),
    "ReportRegisterFilter",
  ),
  categoryCreationModal: lazyScreen(
    () => import("../catalog/create-category-from-selector-modal"),
    "CreateCategoryFromSelectorModal",
  ),
  productCreationModal: lazyScreen(
    () => import("../catalog/create-product-from-selector-modal"),
    "CreateProductFromSelectorModal",
  ),
  productPriceSection: lazyScreen(
    () => import("../pricing/product-price-section"),
    "ProductPriceSection",
  ),
  productPanelSections: {
    priceAndCost: lazyScreen(
      () => import("../pricing/product-price-cost-section"),
      "ProductPriceCostSection",
    ),
    stockAndLots: lazyScreen(() => import("../stock/product-stock-section"), "ProductStockSection"),
    recipeAndBatches: lazyScreen(
      () => import("../stock/product-recipe-section"),
      "ProductRecipeSection",
    ),
    recipeLookup: LazyProductRecipeLookup,
  },
  registerPointOfSaleSection: lazyScreen(
    () => import("../fiscal/register-point-of-sale-panel-section"),
    "RegisterPointOfSalePanelSection",
  ),
  registerPanelSections: {
    payments: lazyScreen(
      () => import("../payments/register-payments-section"),
      "RegisterPaymentsSection",
    ),
    backups: lazyScreen(
      () => import("../register/snapshot-backups-section"),
      "SnapshotBackupsSection",
    ),
    sessions: lazyScreen(
      () => import("../register/register-sessions-section"),
      "RegisterSessionsSection",
    ),
  },
  registerPaymentModals: lazyScreen(
    () => import("../payments/register-payment-modals"),
    "RegisterPaymentModals",
  ),
  registerKeyModals: lazyScreen(
    () => import("../register/register-key-modals"),
    "RegisterKeyModals",
  ),
  contingencyTicketRescueAssistant: lazyScreen(
    () => import("../backups/contingency-ticket-rescue-assistant"),
    "ContingencyTicketRescueAssistant",
  ),
  roleCreationModal: lazyScreen(
    () => import("../permissions/create-role-from-selector-modal"),
    "CreateRoleFromSelectorModal",
  ),
  accountFooter: defaultAccountFooterServices,
  screenFailure: defaultScreenFailureServices,
  releaseMonitor: defaultReleaseMonitor,
};

export type AppProps = {
  help: BackofficeHelpCatalog;
  services?: AppServices;
  reportError?: (error: unknown) => void;
};

type SessionState = { kind: "loading" } | SettledSession;

function signedInSessionOf(outcome: Extract<SessionOutcome, { kind: "ok" }>): SignedInSession {
  return {
    kind: "signed-in",
    userId: outcome.userId,
    displayName: outcome.displayName,
    capabilities: outcome.capabilities,
    stockMovementKinds: outcome.stockMovementKinds,
    mayEmitOwnPinCode: outcome.mayEmitOwnPinCode,
    expiresAt: outcome.expiresAt,
  };
}

function differsOnlyInExpiry(current: SettledSession, next: SettledSession): boolean {
  return (
    current.kind === "signed-in" &&
    next.kind === "signed-in" &&
    current.userId === next.userId &&
    current.displayName === next.displayName &&
    current.capabilities.join() === next.capabilities.join() &&
    current.stockMovementKinds.join() === next.stockMovementKinds.join() &&
    current.mayEmitOwnPinCode === next.mayEmitOwnPinCode
  );
}

const BEFORE_SESSION_CHECK: SettledSession = { kind: "signed-out", notice: undefined };

type SessionControlOptions = {
  help: BackofficeHelpCatalog;
  services: RouteServices;
  reportError: (error: unknown) => void;
  queryClient: ReturnType<typeof createQueryClient>;
  setSession: (next: SessionState) => void;
  setRouterStarted: (started: boolean) => void;
};

function createSessionControl({
  help,
  services,
  reportError,
  queryClient,
  setSession,
  setRouterStarted,
}: SessionControlOptions) {
  async function settle(next: SettledSession) {
    const current = router.options.context.session;
    if (next.kind === "signed-out") {
      queryClient.clear();
    }
    router.update({ ...router.options, context: { ...router.options.context, session: next } });
    if (!differsOnlyInExpiry(current, next)) {
      await router.invalidate();
    }
    if (router.options.context.session === next) {
      setSession(next);
      setRouterStarted(true);
    }
  }

  function settleCheckedSession(outcome: SessionOutcome) {
    if (outcome.kind === "ok") {
      markSignedIn();
      return settle(signedInSessionOf(outcome));
    }
    if (outcome.kind === "rate_limited") {
      return settle({
        kind: "signed-out",
        notice: { kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds },
      });
    }
    if (outcome.kind === "failed") {
      return settle({ kind: "signed-out", notice: { kind: "check_failed" } });
    }
    const expired = wasSignedIn();
    clearSignedInMarker();
    return settle({ kind: "signed-out", notice: expired ? { kind: "expired" } : undefined });
  }

  function handleSignedIn() {
    setSession({ kind: "loading" });
    void services.fetchSession().then((outcome) => {
      if (outcome.kind === "ok") {
        markSignedIn();
        void settle(signedInSessionOf(outcome));
        return;
      }
      if (outcome.kind === "rate_limited") {
        void settle({
          kind: "signed-out",
          notice: { kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds },
        });
        return;
      }
      void settle({
        kind: "signed-out",
        notice: outcome.kind === "failed" ? { kind: "check_failed" } : undefined,
      });
    });
  }

  function handleSignedOut() {
    clearSignedInMarker();
    void settle({ kind: "signed-out", notice: undefined });
  }

  function handleSessionEnded() {
    clearSignedInMarker();
    void settle({ kind: "signed-out", notice: { kind: "expired" } });
  }

  const router = createAppRouter({
    session: BEFORE_SESSION_CHECK,
    help,
    services,
    reportError,
    sessionActions: {
      signedIn: handleSignedIn,
      signedOut: handleSignedOut,
      sessionEnded: handleSessionEnded,
    },
  });

  return { router, settle, settleCheckedSession, handleSessionEnded };
}

export function App(props: AppProps) {
  return (
    <LocaleProvider>
      <FieldSizeProvider size="backoffice">
        <AppContent {...props} />
      </FieldSizeProvider>
    </LocaleProvider>
  );
}

function AppContent({ help, services: givenServices, reportError = () => {} }: AppProps) {
  const services: RouteServices = givenServices ?? defaultRouteServices;
  const [session, setSession] = useState<SessionState>({ kind: "loading" });
  const [routerStarted, setRouterStarted] = useState(false);
  const [queryClient] = useState(createQueryClient);
  const [control] = useState(() =>
    createSessionControl({
      help,
      services,
      reportError,
      queryClient,
      setSession,
      setRouterStarted,
    }),
  );
  const { router } = control;

  useEffect(() => {
    let cancelled = false;
    void services.fetchSession().then((outcome) => {
      if (!cancelled) {
        void control.settleCheckedSession(outcome);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [services, control]);

  useSessionWatcher({
    active: session.kind === "signed-in",
    checkStatus: services.checkSessionStatus,
    onEnded: control.handleSessionEnded,
    ...(session.kind === "signed-in" ? { initialExpiresAt: session.expiresAt } : {}),
  });

  useReleaseWatcher({ monitor: services.releaseMonitor });

  useSessionActivityReporter({
    active: session.kind === "signed-in",
    touchSession: services.fetchSession,
    subscribeToNavigation: (listener) => router.subscribe("onBeforeNavigate", listener),
    onTouched: (touched) => {
      const current = router.options.context.session;
      if (current.kind === "signed-in") {
        void control.settle({
          ...current,
          capabilities: touched.capabilities,
          stockMovementKinds: touched.stockMovementKinds,
          mayEmitOwnPinCode: touched.mayEmitOwnPinCode,
          expiresAt: touched.expiresAt,
        });
      }
    },
    onEnded: control.handleSessionEnded,
  });

  if (!routerStarted) {
    return null;
  }

  return (
    <ReleaseMonitorContext value={services.releaseMonitor}>
      <SessionCheckPendingContext value={session.kind === "loading"}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </SessionCheckPendingContext>
      <NewReleaseNotice reloadPage={services.screenFailure.reloadPage} />
    </ReleaseMonitorContext>
  );
}
