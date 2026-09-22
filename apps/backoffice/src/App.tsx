import { AreaNavItem } from "@purosur/ui";
import { LifeBuoy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AccountRecoveryScreen } from "./AccountRecoveryScreen";
import { AyudaContent, AyudaSectionColumn } from "./AyudaScreen";
import { ACCOUNT_RECOVERY_PATH, REGISTER_PASSKEY_PATH, SIGN_IN_PATH } from "./accessRoutes";
import { type AyudaHelpCatalog, type AyudaRoute, resolveAyudaPath } from "./ayudaRoutes";
import { linkProps } from "./linkProps";
import { messages } from "./messages";
import { RegisterPasskeyScreen } from "./RegisterPasskeyScreen";
import { navigate, onNavigate, useRoute } from "./router";
import { Shell } from "./Shell";
import { SignInScreen } from "./SignInScreen";

export type AppProps = {
  help: AyudaHelpCatalog;
};

function documentTitle(help: AyudaHelpCatalog, { categoryId, articleId }: AyudaRoute): string {
  const page =
    (articleId ? help.articles[articleId]?.title : undefined) ??
    (categoryId ? help.categories[categoryId]?.label : undefined);
  return page ? messages.ayuda.pageDocumentTitle({ page }) : messages.ayuda.documentTitle;
}

/** The Ayuda-in-Shell part of the app, root for every path outside the access screens below. */
function AyudaApp({ help }: AppProps) {
  const route = useRoute();
  const ayudaRoute = resolveAyudaPath(help, route);
  const [search, setSearch] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownPath = useRef(ayudaRoute.path);
  const title = documentTitle(help, ayudaRoute);

  useEffect(() => onNavigate(() => setSearch("")), []);

  useEffect(() => {
    if (ayudaRoute.path !== route) {
      navigate(ayudaRoute.path, { replace: true });
    }
  }, [ayudaRoute.path, route]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    if (shownPath.current !== ayudaRoute.path) {
      shownPath.current = ayudaRoute.path;
      headingRef.current?.focus();
    }
  }, [ayudaRoute.path]);

  return (
    <Shell
      brandName={messages.shell.brandName}
      areaRailLabel={messages.shell.areaRailLabel}
      sectionColumnLabel={messages.ayuda.sectionsNavLabel}
      railFooter={
        <AreaNavItem
          label={messages.ayuda.areaLabel}
          icon={<LifeBuoy />}
          active
          {...linkProps("/ayuda")}
        />
      }
      sectionColumn={<AyudaSectionColumn help={help} activeCategoryId={ayudaRoute.categoryId} />}
    >
      <AyudaContent
        help={help}
        categoryId={ayudaRoute.categoryId}
        articleId={ayudaRoute.articleId}
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
      return <AyudaApp help={help} />;
  }
}
