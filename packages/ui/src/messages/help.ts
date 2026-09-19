import type { Locale } from "./formatters";

export type CategoryRecord = Record<string, string>;

export type HelpBlock<ArticleId extends string> =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "steps"; items: readonly [string, ...string[]] }
  | { kind: "note"; text: string }
  | { kind: "articleLink"; article: ArticleId };

export type HelpArticle<CategoryId extends string, ArticleId extends string> = {
  category: CategoryId;
  title: string;
  body: readonly HelpBlock<ArticleId>[];
  related?: readonly ArticleId[];
};

export type HelpCatalog<
  Categories extends CategoryRecord,
  Articles extends Record<string, HelpArticle<string, string>>,
> = {
  categories: Categories;
  articles: Articles;
};

// A record whose every article's `category`, `related`, and `articleLink.article` point at a real
// id of the given `Categories`/`Articles`.
export type HelpArticles<
  Categories extends CategoryRecord,
  Articles extends Record<string, HelpArticle<string, string>>,
> = Record<string, HelpArticle<Extract<keyof Categories, string>, Extract<keyof Articles, string>>>;

export function defineHelp<
  const Categories extends CategoryRecord,
  const Articles extends HelpArticles<Categories, Articles>,
>(_locale: Locale, content: HelpCatalog<Categories, Articles>): HelpCatalog<Categories, Articles> {
  return content;
}
