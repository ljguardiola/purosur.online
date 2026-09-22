import { AreaNavItem } from "@purosur/ui";
import { LifeBuoy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AyudaContent, AyudaSectionColumn } from "./AyudaScreen";
import { INGRESAR_PATH, RECUPERAR_ENLACE_PATH, RECUPERAR_PATH } from "./accessRoutes";
import { type AyudaHelpCatalog, type AyudaRoute, resolveAyudaPath } from "./ayudaRoutes";
import { IngresarScreen } from "./IngresarScreen";
import { linkProps } from "./linkProps";
import { messages } from "./messages";
import { RecuperarScreen } from "./RecuperarScreen";
import { RegistrarPasskeyScreen } from "./RegistrarPasskeyScreen";
import { navigate, onNavigate, useRoute } from "./router";
import { Shell } from "./Shell";

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

/** Routes to the access screens outside the Shell (design.pen's "Backoffice / Acceso" frames), or to the Ayuda-in-Shell app for every other path; the root path stays Ayuda until #168 gates it behind a session. */
export function App({ help }: AppProps) {
  const route = useRoute();

  switch (route) {
    case INGRESAR_PATH:
      return <IngresarScreen />;
    case RECUPERAR_PATH:
      return <RecuperarScreen />;
    case RECUPERAR_ENLACE_PATH:
      return <RegistrarPasskeyScreen />;
    default:
      return <AyudaApp help={help} />;
  }
}
