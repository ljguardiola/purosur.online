import { FieldSizeProvider } from "@purosur/ui";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { AccountRecoveryScreenServices } from "../access/account-recovery-screen";
import type { MyAccountScreenServices } from "../access/my-account-screen";
import type { RegisterPasskeyScreenServices } from "../access/register-passkey-screen";
import type { RolesListScreenServices } from "../access/roles-list-screen";
import { checkSessionStatus, fetchSession, type SessionOutcome } from "../access/session-api";
import type { SignInScreenServices } from "../access/sign-in-screen";
import type { UserDetailScreenServices } from "../access/user-detail-screen";
import type { UsersListScreenServices } from "../access/users-list-screen";
import type { AlertsListScreenServices } from "../alerts/alerts-list-screen";
import type { BranchSettingsScreenServices } from "../branch/branch-settings-screen";
import type { CategoriesListScreenServices } from "../catalog/categories-list-screen";
import type { ProductsListScreenServices } from "../catalog/products-list-screen";
import type { FiscalConfigurationScreenServices } from "../fiscal/fiscal-configuration-screen";
import type { BackofficeHelpCatalog } from "../help/help-page";
import { useLatestRef } from "../platform/use-latest-ref";
import type { PricesListScreenServices } from "../pricing/prices-list-screen";
import type { RegistersListScreenServices } from "../register/registers-list-screen";
import { type AccountFooterServices, defaultAccountFooterServices } from "./account-footer";
import { createAppRouter } from "./app-router";
import {
  type SessionActions,
  SessionCheckPendingContext,
  type SettledSession,
  type SignedInSession,
} from "./root-route";
import { useSessionActivityReporter } from "./session-activity-reporter";
import { clearSignedInMarker, markSignedIn, wasSignedIn } from "./session-marker";
import { useSessionWatcher } from "./session-watcher";

export type AppServices = {
  fetchSession: typeof fetchSession;
  checkSessionStatus: typeof checkSessionStatus;
  signInScreen?: SignInScreenServices;
  accountRecoveryScreen?: AccountRecoveryScreenServices;
  registerPasskeyScreen?: RegisterPasskeyScreenServices;
  myAccountScreen?: MyAccountScreenServices;
  usersListScreen?: UsersListScreenServices;
  userDetailScreen?: UserDetailScreenServices;
  rolesListScreen?: RolesListScreenServices;
  registersListScreen?: RegistersListScreenServices;
  branchSettingsScreen?: BranchSettingsScreenServices;
  categoriesListScreen?: CategoriesListScreenServices;
  productsListScreen?: ProductsListScreenServices;
  pricesListScreen?: PricesListScreenServices;
  fiscalConfigurationScreen?: FiscalConfigurationScreenServices;
  accountFooter: AccountFooterServices;
  alertsListScreen?: AlertsListScreenServices;
};

const defaultAppServices: AppServices = {
  fetchSession,
  checkSessionStatus,
  accountFooter: defaultAccountFooterServices,
};

export type AppProps = {
  help: BackofficeHelpCatalog;
  services?: AppServices;
};

type SessionState = { kind: "loading" } | SettledSession;

function signedInSessionOf(outcome: Extract<SessionOutcome, { kind: "ok" }>): SignedInSession {
  return {
    kind: "signed-in",
    userId: outcome.userId,
    displayName: outcome.displayName,
    isAdministrator: outcome.isAdministrator,
    permissions: outcome.permissions ?? [],
    ...(outcome.expiresAt !== undefined ? { expiresAt: outcome.expiresAt } : {}),
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

function AppContent({ help, services = defaultAppServices }: AppProps) {
  const [session, setSession] = useState<SessionState>({ kind: "loading" });
  const [routerStarted, setRouterStarted] = useState(false);
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
      sessionActions: {
        signedIn: () => actions.current.signedIn(),
        signedOut: () => actions.current.signedOut(),
        sessionEnded: () => actions.current.sessionEnded(),
      },
    }),
  );

  async function settle(next: SettledSession) {
    const current = router.options.context.session;
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
    ...(session.kind === "signed-in" && session.expiresAt !== undefined
      ? { initialExpiresAt: session.expiresAt }
      : {}),
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
          permissions: touched.permissions ?? [],
          ...(touched.expiresAt !== undefined ? { expiresAt: touched.expiresAt } : {}),
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
      <RouterProvider router={router} />
    </SessionCheckPendingContext>
  );
}
