import { AreaNavItem, SectionNavItem } from "@purosur/ui";
import { LifeBuoy, Settings, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AccountFooter,
  type AccountFooterServices,
  defaultAccountFooterServices,
} from "./AccountFooter";
import {
  AccountRecoveryScreen,
  type AccountRecoveryScreenServices,
  defaultAccountRecoveryScreenServices,
} from "./AccountRecoveryScreen";
import { ACCOUNT_RECOVERY_PATH, REGISTER_PASSKEY_PATH, SIGN_IN_PATH } from "./accessRoutes";
import { HelpContent, HelpSectionColumn } from "./HelpScreen";
import { type BackofficeHelpCatalog, type HelpRoute, resolveHelpPath } from "./helpRoutes";
import { linkProps } from "./linkProps";
import {
  defaultMyAccountScreenServices,
  MyAccountScreen,
  type MyAccountScreenServices,
} from "./MyAccountScreen";
import { messages } from "./messages";
import {
  defaultRegisterPasskeyScreenServices,
  RegisterPasskeyScreen,
  type RegisterPasskeyScreenServices,
} from "./RegisterPasskeyScreen";
import { navigate, onNavigate, useRoute } from "./router";
import { Shell } from "./Shell";
import {
  defaultSignInScreenServices,
  type SignInOpeningNotice,
  SignInScreen,
  type SignInScreenServices,
} from "./SignInScreen";
import { fetchSession } from "./sessionApi";
import { clearSignedInMarker, markSignedIn, wasSignedIn } from "./sessionMarker";
import { MY_ACCOUNT_PATH } from "./settingsRoutes";

export type AppServices = {
  fetchSession: typeof fetchSession;
  signInScreen: SignInScreenServices;
  accountRecoveryScreen: AccountRecoveryScreenServices;
  registerPasskeyScreen: RegisterPasskeyScreenServices;
  myAccountScreen: MyAccountScreenServices;
  accountFooter: AccountFooterServices;
};

const defaultAppServices: AppServices = {
  fetchSession,
  signInScreen: defaultSignInScreenServices,
  accountRecoveryScreen: defaultAccountRecoveryScreenServices,
  registerPasskeyScreen: defaultRegisterPasskeyScreenServices,
  myAccountScreen: defaultMyAccountScreenServices,
  accountFooter: defaultAccountFooterServices,
};

export type AppProps = {
  help: BackofficeHelpCatalog;
  /** Injected in tests so App and every screen it renders skip the real APIs and WebAuthn. */
  services?: AppServices;
};

type SessionState =
  | { kind: "loading" }
  | { kind: "signed-out"; notice: SignInOpeningNotice | undefined }
  | { kind: "signed-in"; displayName: string };

function documentTitle(help: BackofficeHelpCatalog, { categoryId, articleId }: HelpRoute): string {
  const page =
    (articleId ? help.articles[articleId]?.title : undefined) ??
    (categoryId ? help.categories[categoryId]?.label : undefined);
  return page ? messages.help.pageDocumentTitle({ page }) : messages.help.documentTitle;
}

/**
 * Puro Sur's Config area item — the single shared definition of its label, icon and link, so
 * Help's rail and Config's own rail can't drift on it: each only sets which one is active.
 */
function ConfigAreaItem({ active }: { active: boolean }) {
  return (
    <AreaNavItem
      label={messages.settings.areaLabel}
      icon={<Settings />}
      active={active}
      {...linkProps(MY_ACCOUNT_PATH)}
    />
  );
}

/**
 * Puro Sur's Ayuda area item, pinned in the rail footer — the single shared definition of its
 * label, icon and link, so Config's rail and Help's own rail can't drift on it.
 */
function HelpAreaItem({ active }: { active: boolean }) {
  return (
    <AreaNavItem
      label={messages.help.areaLabel}
      icon={<LifeBuoy />}
      active={active}
      {...linkProps("/help")}
    />
  );
}

type HelpAppProps = {
  help: BackofficeHelpCatalog;
  displayName: string;
  onSignedOut: () => void;
  accountFooterServices: AccountFooterServices;
};

/** The Help-in-Shell part of the app, root for every path outside the access screens below. */
function HelpApp({ help, displayName, onSignedOut, accountFooterServices }: HelpAppProps) {
  const route = useRoute();
  const helpRoute = resolveHelpPath(help, route);
  const [search, setSearch] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownPath = useRef(helpRoute.path);
  const title = documentTitle(help, helpRoute);

  useEffect(() => onNavigate(() => setSearch("")), []);

  useEffect(() => {
    if (helpRoute.path !== route) {
      navigate(helpRoute.path, { replace: true });
    }
  }, [helpRoute.path, route]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    if (shownPath.current !== helpRoute.path) {
      shownPath.current = helpRoute.path;
      headingRef.current?.focus();
    }
  }, [helpRoute.path]);

  return (
    <Shell
      brandName={messages.shell.brandName}
      areaRailLabel={messages.shell.areaRailLabel}
      sectionColumnLabel={messages.help.sectionsNavLabel}
      railAreas={<ConfigAreaItem active={false} />}
      railFooter={
        <>
          <HelpAreaItem active />
          <AccountFooter
            displayName={displayName}
            onSignedOut={onSignedOut}
            services={accountFooterServices}
          />
        </>
      }
      sectionColumn={<HelpSectionColumn help={help} activeCategoryId={helpRoute.categoryId} />}
    >
      <HelpContent
        help={help}
        categoryId={helpRoute.categoryId}
        articleId={helpRoute.articleId}
        search={search}
        onSearchChange={setSearch}
        headingRef={headingRef}
      />
    </Shell>
  );
}

type SettingsAppProps = {
  displayName: string;
  onSignedOut: () => void;
  onSessionEnded: () => void;
  accountFooterServices: AccountFooterServices;
  myAccountScreenServices: MyAccountScreenServices;
};

/** The Config-in-Shell part of the app: today, just "Mi cuenta" under its single "Usuarios" section. */
function SettingsApp({
  displayName,
  onSignedOut,
  onSessionEnded,
  accountFooterServices,
  myAccountScreenServices,
}: SettingsAppProps) {
  useEffect(() => {
    document.title = messages.settings.myAccount.documentTitle;
  }, []);

  return (
    <Shell
      brandName={messages.shell.brandName}
      areaRailLabel={messages.shell.areaRailLabel}
      sectionColumnLabel={messages.settings.sectionsNavLabel}
      railAreas={<ConfigAreaItem active />}
      railFooter={
        <>
          <HelpAreaItem active={false} />
          <AccountFooter
            displayName={displayName}
            onSignedOut={onSignedOut}
            services={accountFooterServices}
          />
        </>
      }
      sectionColumn={
        <>
          <h2 className="font-bold text-brand-blue-strong text-xl">
            {messages.settings.sectionsHeading}
          </h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            <li>
              <SectionNavItem
                label={messages.settings.usersSectionLabel}
                icon={<Users />}
                active
                {...linkProps(MY_ACCOUNT_PATH)}
              />
            </li>
          </ul>
        </>
      }
    >
      <MyAccountScreen
        displayName={displayName}
        onSessionEnded={onSessionEnded}
        services={myAccountScreenServices}
      />
    </Shell>
  );
}

export function App({ help, services }: AppProps) {
  const {
    fetchSession,
    signInScreen,
    accountRecoveryScreen,
    registerPasskeyScreen,
    myAccountScreen,
    accountFooter,
  } = services ?? defaultAppServices;
  const route = useRoute();
  const [session, setSession] = useState<SessionState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void fetchSession().then((outcome) => {
      if (cancelled) {
        return;
      }
      if (outcome.kind === "ok") {
        markSignedIn();
        setSession({ kind: "signed-in", displayName: outcome.displayName });
        return;
      }
      if (outcome.kind === "rate_limited") {
        // Same reasoning as "failed" below: nobody said the session ended, so the marker stays.
        setSession({
          kind: "signed-out",
          notice: { kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds },
        });
        return;
      }
      if (outcome.kind === "failed") {
        // Nobody said the session ended — the question never got an answer. Clearing the marker
        // here would turn the next attempt's honest "venció" into a lie, and the session itself
        // may well still be live.
        setSession({ kind: "signed-out", notice: { kind: "check_failed" } });
        return;
      }
      const expired = wasSignedIn();
      clearSignedInMarker();
      setSession({ kind: "signed-out", notice: expired ? { kind: "expired" } : undefined });
    });
    return () => {
      cancelled = true;
    };
  }, [fetchSession]);

  const isAccessRoute =
    route === SIGN_IN_PATH || route === ACCOUNT_RECOVERY_PATH || route === REGISTER_PASSKEY_PATH;

  useEffect(() => {
    if (session.kind === "loading") {
      return;
    }
    if (session.kind === "signed-in" && route === SIGN_IN_PATH) {
      navigate("/", { replace: true });
    } else if (session.kind !== "signed-in" && !isAccessRoute) {
      navigate(SIGN_IN_PATH, { replace: true });
    }
  }, [session.kind, route, isAccessRoute]);

  function handleSignedIn() {
    setSession({ kind: "loading" });
    void fetchSession().then((outcome) => {
      if (outcome.kind === "ok") {
        markSignedIn();
        setSession({ kind: "signed-in", displayName: outcome.displayName });
        return;
      }
      if (outcome.kind === "rate_limited") {
        setSession({
          kind: "signed-out",
          notice: { kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds },
        });
        return;
      }
      setSession({
        kind: "signed-out",
        notice: outcome.kind === "failed" ? { kind: "check_failed" } : undefined,
      });
    });
  }

  function handleSignedOut() {
    clearSignedInMarker();
    setSession({ kind: "signed-out", notice: undefined });
    navigate(SIGN_IN_PATH, { replace: true });
  }

  // A signed-in screen's own API call can find the session already ended (idle/absolute expiry,
  // or signed out from elsewhere) after the mount check above already found it open: same outcome
  // as that check finding none, so it gets the same expired notice.
  function handleSessionEnded() {
    clearSignedInMarker();
    setSession({ kind: "signed-out", notice: { kind: "expired" } });
    navigate(SIGN_IN_PATH, { replace: true });
  }

  if (session.kind === "loading") {
    return null;
  }

  switch (route) {
    case SIGN_IN_PATH:
      return session.kind === "signed-in" ? null : (
        <SignInScreen
          openingNotice={session.notice}
          onSignedIn={handleSignedIn}
          services={signInScreen}
        />
      );
    case ACCOUNT_RECOVERY_PATH:
      return <AccountRecoveryScreen services={accountRecoveryScreen} />;
    case REGISTER_PASSKEY_PATH:
      return <RegisterPasskeyScreen services={registerPasskeyScreen} />;
    case MY_ACCOUNT_PATH:
      return session.kind === "signed-in" ? (
        <SettingsApp
          displayName={session.displayName}
          onSignedOut={handleSignedOut}
          onSessionEnded={handleSessionEnded}
          accountFooterServices={accountFooter}
          myAccountScreenServices={myAccountScreen}
        />
      ) : null;
    default:
      return session.kind === "signed-in" ? (
        <HelpApp
          help={help}
          displayName={session.displayName}
          onSignedOut={handleSignedOut}
          accountFooterServices={accountFooter}
        />
      ) : null;
  }
}
