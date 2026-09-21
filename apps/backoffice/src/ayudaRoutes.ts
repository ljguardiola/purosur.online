import type { CategoryRecord, HelpArticle, HelpCatalog } from "@purosur/ui";

export type AyudaHelpCatalog = HelpCatalog<
  CategoryRecord,
  Record<string, HelpArticle<string, string>>
>;

export type AyudaRoute = {
  /** The canonical URL for what was asked; differs from the requested path when it was not canonical or named nothing in the catalog. */
  path: string;
  categoryId: string | null;
  articleId: string | null;
};

const AYUDA_PATH = "/ayuda";

const ayudaHome: AyudaRoute = { path: AYUDA_PATH, categoryId: null, articleId: null };

export function sectionHref(categoryId: string): string {
  return `${AYUDA_PATH}/${categoryId}`;
}

export function articleHref(categoryId: string, articleId: string): string {
  return `${AYUDA_PATH}/${categoryId}/${articleId}`;
}

/** Resolves a router path against the /ayuda[/:category[/:article]] scheme and the catalog. */
export function resolveAyudaPath(help: AyudaHelpCatalog, path: string): AyudaRoute {
  const [root, categoryId, articleId, ...rest] = path.replace(/\/$/, "").split("/").slice(1);
  if (`/${root}` !== AYUDA_PATH || rest.length > 0) {
    return ayudaHome;
  }
  const article =
    articleId !== undefined && Object.hasOwn(help.articles, articleId)
      ? help.articles[articleId]
      : undefined;
  if (article && articleId !== undefined) {
    return {
      path: articleHref(article.category, articleId),
      categoryId: article.category,
      articleId,
    };
  }
  return categoryId !== undefined && Object.hasOwn(help.categories, categoryId)
    ? { path: sectionHref(categoryId), categoryId, articleId: null }
    : ayudaHome;
}
