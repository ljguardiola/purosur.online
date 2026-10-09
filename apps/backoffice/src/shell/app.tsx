import { FieldSizeProvider, LocaleProvider } from "@purosur/ui";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  type AlertsListScreenServices,
  defaultAlertsListScreenServices,
} from "../alerts/alerts-list-services";
import {
  type BranchSettingsScreenServices,
  defaultBranchSettingsScreenServices,
} from "../branch/branch-settings-services";
import {
  type BrandsListScreenServices,
  defaultBrandsListScreenServices,
} from "../catalog/brands-list-services";
import {
  type CategoriesListScreenServices,
  defaultCategoriesListScreenServices,
} from "../catalog/categories-list-services";
import {
  defaultProductsListScreenServices,
  type ProductsListScreenServices,
} from "../catalog/products-list-services";
import {
  defaultTagsListScreenServices,
  type TagsListScreenServices,
} from "../catalog/tags-list-services";
import {
  type AccountRecoveryScreenServices,
  defaultAccountRecoveryScreenServices,
} from "../credentials/account-recovery-services";
import {
  defaultMyAccountScreenServices,
  type MyAccountScreenServices,
} from "../credentials/my-account-services";
import {
  defaultRegisterPasskeyScreenServices,
  type RegisterPasskeyScreenServices,
} from "../credentials/register-passkey-services";
import {
  defaultUserCredentialSectionsServices,
  type UserCredentialSectionsServices,
} from "../credentials/user-credential-sections-services";
import {
  defaultFiscalConfigurationScreenServices,
  type FiscalConfigurationScreenServices,
} from "../fiscal/fiscal-configuration-services";
import {
  defaultPointsOfSaleScreenServices,
  type PointsOfSaleScreenServices,
} from "../fiscal/points-of-sale-services";
import type { BackofficeHelpCatalog } from "../help/help-catalog";
import {
  defaultPendingRefundsScreenServices,
  type PendingRefundsScreenServices,
} from "../payments/pending-refunds-services";
import {
  defaultRolesListScreenServices,
  type RolesListScreenServices,
} from "../permissions/roles-list-services";
import { createQueryClient } from "../platform/query-client";
import {
  type DiscountsListScreenServices,
  defaultDiscountsListScreenServices,
} from "../pricing/discounts-list-services";
import {
  defaultPricesListScreenServices,
  type PricesListScreenServices,
} from "../pricing/prices-list-services";
import {
  defaultRegistersListScreenServices,
  type RegistersListScreenServices,
} from "../register/registers-list-services";
import {
  defaultSalesByDayScreenServices,
  type SalesByDayScreenServices,
} from "../sales/sales-by-day-services";
import { checkSessionStatus, fetchSession, type SessionOutcome } from "../sessions/session-api";
import {
  defaultSignInScreenServices,
  type SignInScreenServices,
} from "../sessions/sign-in-services";
import {
  defaultStockBalancesScreenServices,
  type StockBalancesScreenServices,
} from "../stock/stock-balances-services";
import {
  defaultStockCountsScreenServices,
  type StockCountsScreenServices,
} from "../stock/stock-counts-services";
import {
  defaultStockMovementsScreenServices,
  type StockMovementsScreenServices,
} from "../stock/stock-movements-services";
import {
  defaultUserDetailScreenServices,
  type UserDetailPageServices,
} from "../users/user-detail-services";
import {
  defaultUsersListScreenServices,
  type UsersListScreenServices,
} from "../users/users-list-services";
import { type AccountFooterServices, defaultAccountFooterServices } from "./account-footer";
import { createAppRouter } from "./app-router";
import { defaultHomeScreenServices, type HomeScreenServices } from "./home-screen-services";
import { lazyScreen } from "./lazy-screen";
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
  myAccountScreen: MyAccountScreenServices;
  usersListScreen: UsersListScreenServices;
  userDetailScreen: UserDetailPageServices;
  userCredentialSections: UserCredentialSectionsServices;
  rolesListScreen: RolesListScreenServices;
  registersListScreen: RegistersListScreenServices;
  branchSettingsScreen: BranchSettingsScreenServices;
  categoriesListScreen: CategoriesListScreenServices;
  brandsListScreen: BrandsListScreenServices;
  tagsListScreen: TagsListScreenServices;
  productsListScreen: ProductsListScreenServices;
  pricesListScreen: PricesListScreenServices;
  discountsListScreen: DiscountsListScreenServices;
  salesByDayScreen: SalesByDayScreenServices;
  pendingRefundsScreen: PendingRefundsScreenServices;
  stockBalancesScreen: StockBalancesScreenServices;
  stockCountsScreen: StockCountsScreenServices;
  stockMovementsScreen: StockMovementsScreenServices;
  fiscalConfigurationScreen: FiscalConfigurationScreenServices;
  pointsOfSaleScreen: PointsOfSaleScreenServices;
  accountFooter: AccountFooterServices;
  screenFailure: ScreenFailureServices;
  homeScreen: HomeScreenServices;
  alertsListScreen: AlertsListScreenServices;
};

const defaultAppServices: AppServices = {
  fetchSession,
  checkSessionStatus,
  signInScreen: defaultSignInScreenServices,
  accountRecoveryScreen: defaultAccountRecoveryScreenServices,
  registerPasskeyScreen: defaultRegisterPasskeyScreenServices,
  myAccountScreen: defaultMyAccountScreenServices,
  usersListScreen: defaultUsersListScreenServices,
  userDetailScreen: {
    ...defaultUserDetailScreenServices,
    credentialSections: lazyScreen(
      () => import("../credentials/user-credential-sections"),
      "UserCredentialSections",
    ),
  },
  userCredentialSections: defaultUserCredentialSectionsServices,
  rolesListScreen: defaultRolesListScreenServices,
  registersListScreen: defaultRegistersListScreenServices,
  branchSettingsScreen: defaultBranchSettingsScreenServices,
  categoriesListScreen: defaultCategoriesListScreenServices,
  brandsListScreen: defaultBrandsListScreenServices,
  tagsListScreen: defaultTagsListScreenServices,
  productsListScreen: defaultProductsListScreenServices,
  pricesListScreen: defaultPricesListScreenServices,
  discountsListScreen: defaultDiscountsListScreenServices,
  salesByDayScreen: defaultSalesByDayScreenServices,
  pendingRefundsScreen: defaultPendingRefundsScreenServices,
  stockBalancesScreen: defaultStockBalancesScreenServices,
  stockCountsScreen: defaultStockCountsScreenServices,
  stockMovementsScreen: defaultStockMovementsScreenServices,
  fiscalConfigurationScreen: defaultFiscalConfigurationScreenServices,
  pointsOfSaleScreen: defaultPointsOfSaleScreenServices,
  accountFooter: defaultAccountFooterServices,
  screenFailure: defaultScreenFailureServices,
  homeScreen: defaultHomeScreenServices,
  alertsListScreen: defaultAlertsListScreenServices,
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
  services: AppServices;
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

function AppContent({ help, services = defaultAppServices, reportError = () => {} }: AppProps) {
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
    <SessionCheckPendingContext value={session.kind === "loading"}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </SessionCheckPendingContext>
  );
}
