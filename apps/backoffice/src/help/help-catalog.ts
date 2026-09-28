import type { CategoryRecord, HelpArticle, HelpCatalog } from "@purosur/ui";

export type BackofficeHelpCatalog = HelpCatalog<
  CategoryRecord,
  Record<string, HelpArticle<string, string>>
>;

export type HelpPage =
  | { categoryId: null; articleId: null }
  | { categoryId: string; articleId: null }
  | { categoryId: string; articleId: string };

export type RequestedHelpPage = { categoryId?: string; articleId?: string };

export function canonicalHelpPage(
  help: BackofficeHelpCatalog,
  { categoryId, articleId }: RequestedHelpPage,
): HelpPage {
  const article =
    articleId !== undefined && Object.hasOwn(help.articles, articleId)
      ? help.articles[articleId]
      : undefined;
  if (article && articleId !== undefined) {
    return { categoryId: article.category, articleId };
  }
  return categoryId !== undefined && Object.hasOwn(help.categories, categoryId)
    ? { categoryId, articleId: null }
    : { categoryId: null, articleId: null };
}

export function isRequestedPage(page: HelpPage, requested: RequestedHelpPage): boolean {
  return (
    page.categoryId === (requested.categoryId ?? null) &&
    page.articleId === (requested.articleId ?? null)
  );
}
