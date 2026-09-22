import { AreaNavItem } from "@purosur/ui";
import { LifeBuoy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

export type AppProps = {
  help: BackofficeHelpCatalog;
};

function documentTitle(help: BackofficeHelpCatalog, { categoryId, articleId }: HelpRoute): string {
  const page =
    (articleId ? help.articles[articleId]?.title : undefined) ??
    (categoryId ? help.categories[categoryId]?.label : undefined);
  return page ? messages.help.pageDocumentTitle({ page }) : messages.help.documentTitle;
}

/** The Help-in-Shell part of the app, root for every path outside the access screens below. */
function HelpApp({ help }: AppProps) {
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
        <AreaNavItem
          label={messages.help.areaLabel}
          icon={<LifeBuoy />}
          active
          {...linkProps("/help")}
        />
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

  switch (route) {
    case SIGN_IN_PATH:
      return <SignInScreen />;
    case ACCOUNT_RECOVERY_PATH:
      return <AccountRecoveryScreen />;
    case REGISTER_PASSKEY_PATH:
      return <RegisterPasskeyScreen />;
    default:
      return <HelpApp help={help} />;
  }
}
