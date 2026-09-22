import { AreaNavItem } from "@purosur/ui";
import { LifeBuoy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AccountFooter } from "./AccountFooter";
import { AccountRecoveryScreen } from "./AccountRecoveryScreen";
import { ACCOUNT_RECOVERY_PATH, REGISTER_PASSKEY_PATH, SIGN_IN_PATH } from "./accessRoutes";
import { HelpContent, HelpSectionColumn } from "./HelpScreen";
import { type BackofficeHelpCatalog, type HelpRoute, resolveHelpPath } from "./helpRoutes";
import { linkProps } from "./linkProps";
import { messages } from "./messages";
import { RegisterPasskeyScreen } from "./RegisterPasskeyScreen";
import { navigate, onNavigate, useRoute } from "./router";
import { Shell } from "./Shell";
import { SignInScreen } from "./SignInScreen";
import { fetchSession } from "./sessionApi";
import { clearSignedInMarker, markSignedIn, wasSignedIn } from "./sessionMarker";

export type AppProps = {
  help: BackofficeHelpCatalog;
};

type SessionState =
  | { kind: "loading" }
  | { kind: "signed-out"; expired: boolean }
  | { kind: "signed-in"; displayName: string };

function documentTitle(help: BackofficeHelpCatalog, { categoryId, articleId }: HelpRoute): string {
  const page =
    (articleId ? help.articles[articleId]?.title : undefined) ??
    (categoryId ? help.categories[categoryId]?.label : undefined);
  return page ? messages.help.pageDocumentTitle({ page }) : messages.help.documentTitle;
}

type HelpAppProps = AppProps & {
  displayName: string;
  onSignedOut: () => void;
};

/** The Help-in-Shell part of the app, root for every path outside the access screens below. */
function HelpApp({ help, displayName, onSignedOut }: HelpAppProps) {
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
      railFooter={
        <>
          <AreaNavItem
            label={messages.help.areaLabel}
            icon={<LifeBuoy />}
            active
            {...linkProps("/help")}
          />
          <AccountFooter displayName={displayName} onSignedOut={onSignedOut} />
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

export function App({ help }: AppProps) {
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
      } else {
        const expired = wasSignedIn();
        clearSignedInMarker();
        setSession({ kind: "signed-out", expired });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
      } else {
        setSession({ kind: "signed-out", expired: false });
      }
    });
  }

  function handleSignedOut() {
    clearSignedInMarker();
    setSession({ kind: "signed-out", expired: false });
    navigate(SIGN_IN_PATH, { replace: true });
  }

  if (session.kind === "loading") {
    return null;
  }

  switch (route) {
    case SIGN_IN_PATH:
      return session.kind === "signed-in" ? null : (
        <SignInScreen expired={session.expired} onSignedIn={handleSignedIn} />
      );
    case ACCOUNT_RECOVERY_PATH:
      return <AccountRecoveryScreen />;
    case REGISTER_PASSKEY_PATH:
      return <RegisterPasskeyScreen />;
    default:
      return session.kind === "signed-in" ? (
        <HelpApp help={help} displayName={session.displayName} onSignedOut={handleSignedOut} />
      ) : null;
  }
}
