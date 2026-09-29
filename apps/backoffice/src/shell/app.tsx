import { FieldSizeProvider } from "@purosur/ui";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  type AccountRecoveryScreenServices,
  defaultAccountRecoveryScreenServices,
} from "../access/account-recovery-services";
import {
  defaultMyAccountScreenServices,
  type MyAccountScreenServices,
} from "../access/my-account-services";
import {
  defaultRegisterPasskeyScreenServices,
  type RegisterPasskeyScreenServices,
} from "../access/register-passkey-services";
import {
  defaultRolesListScreenServices,
  type RolesListScreenServices,
} from "../access/roles-list-services";
import { checkSessionStatus, fetchSession, type SessionOutcome } from "../access/session-api";
import { defaultSignInScreenServices, type SignInScreenServices } from "../access/sign-in-services";
import {
  defaultUserDetailScreenServices,
  type UserDetailScreenServices,
} from "../access/user-detail-services";
import {
  defaultUsersListScreenServices,
  type UsersListScreenServices,
} from "../access/users-list-services";
import {
  type AlertsListScreenServices,
  defaultAlertsListScreenServices,
} from "../alerts/alerts-list-services";
import {
  type BranchSettingsScreenServices,
  defaultBranchSettingsScreenServices,
} from "../branch/branch-settings-services";
import {
  type CategoriesListScreenServices,
  defaultCategoriesListScreenServices,
} from "../catalog/categories-list-services";
import {
  defaultProductsListScreenServices,
  type ProductsListScreenServices,
} from "../catalog/products-list-services";
import {
  defaultFiscalConfigurationScreenServices,
  type FiscalConfigurationScreenServices,
} from "../fiscal/fiscal-configuration-services";
import type { BackofficeHelpCatalog } from "../help/help-catalog";
import { createQueryClient } from "../platform/query-client";
import { useLatestRef } from "../platform/use-latest-ref";
import {
  defaultPricesListScreenServices,
  type PricesListScreenServices,
} from "../pricing/prices-list-services";
import {
  defaultRegistersListScreenServices,
  type RegistersListScreenServices,
} from "../register/registers-list-services";
import { type AccountFooterServices, defaultAccountFooterServices } from "./account-footer";
import { createAppRouter } from "./app-router";
import {
  type SessionActions,
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
  userDetailScreen: UserDetailScreenServices;
  rolesListScreen: RolesListScreenServices;
  registersListScreen: RegistersListScreenServices;
  branchSettingsScreen: BranchSettingsScreenServices;
  categoriesListScreen: CategoriesListScreenServices;
  productsListScreen: ProductsListScreenServices;
  pricesListScreen: PricesListScreenServices;
  fiscalConfigurationScreen: FiscalConfigurationScreenServices;
  accountFooter: AccountFooterServices;
  screenFailure: ScreenFailureServices;
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
  userDetailScreen: defaultUserDetailScreenServices,
  rolesListScreen: defaultRolesListScreenServices,
  registersListScreen: defaultRegistersListScreenServices,
  branchSettingsScreen: defaultBranchSettingsScreenServices,
  categoriesListScreen: defaultCategoriesListScreenServices,
  productsListScreen: defaultProductsListScreenServices,
  pricesListScreen: defaultPricesListScreenServices,
  fiscalConfigurationScreen: defaultFiscalConfigurationScreenServices,
  accountFooter: defaultAccountFooterServices,
  screenFailure: defaultScreenFailureServices,
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
    isAdministrator: outcome.isAdministrator,
    permissions: outcome.permissions,
    expiresAt: outcome.expiresAt,
  };
}

function differsOnlyInExpiry(current: SettledSession, next: SettledSession): boolean {
  return (
    current.kind === "signed-in" &&
    next.kind === "signed-in" &&
    current.userId === next.userId &&
    current.displayName === next.displayName &&
    current.isAdministrator === next.isAdministrator &&
    current.permissions.join() === next.permissions.join()
  );
}

const BEFORE_SESSION_CHECK: SettledSession = { kind: "signed-out", notice: undefined };

export function App(props: AppProps) {
  return (
    <FieldSizeProvider size="backoffice">
      <AppContent {...props} />
    </FieldSizeProvider>
  );
}

function AppContent({ help, services = defaultAppServices, reportError = () => {} }: AppProps) {
  const [session, setSession] = useState<SessionState>({ kind: "loading" });
  const [routerStarted, setRouterStarted] = useState(false);
  const [queryClient] = useState(createQueryClient);
  const actions = useLatestRef<SessionActions>({
    signedIn: handleSignedIn,
    signedOut: handleSignedOut,
    sessionEnded: handleSessionEnded,
  });
  const [router] = useState(() =>
    createAppRouter({
      session: BEFORE_SESSION_CHECK,
      help,
      services,
      reportError,
      sessionActions: {
        signedIn: () => actions.current.signedIn(),
        signedOut: () => actions.current.signedOut(),
        sessionEnded: () => actions.current.sessionEnded(),
      },
    }),
  );

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

  const settleCheckedSessionRef = useLatestRef(settleCheckedSession);

  useEffect(() => {
    let cancelled = false;
    void services.fetchSession().then((outcome) => {
      if (!cancelled) {
        void settleCheckedSessionRef.current(outcome);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [services, settleCheckedSessionRef]);

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

  useSessionWatcher({
    active: session.kind === "signed-in",
    checkStatus: services.checkSessionStatus,
    onEnded: handleSessionEnded,
    ...(session.kind === "signed-in" ? { initialExpiresAt: session.expiresAt } : {}),
  });

  useSessionActivityReporter({
    active: session.kind === "signed-in",
    touchSession: services.fetchSession,
    subscribeToNavigation: (listener) => router.subscribe("onBeforeNavigate", listener),
    onTouched: (touched) => {
      const current = router.options.context.session;
      if (current.kind === "signed-in") {
        void settle({
          ...current,
          isAdministrator: touched.isAdministrator,
          permissions: touched.permissions,
          expiresAt: touched.expiresAt,
        });
      }
    },
    onEnded: handleSessionEnded,
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
