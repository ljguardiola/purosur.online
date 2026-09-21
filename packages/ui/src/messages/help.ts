import type { Locale } from "./formatters";

// `icon` is a free-form name (e.g. a lucide-react icon name); this package renders no help UI
// itself, so it neither knows nor constrains which icon set the icon names belong to. Optional:
// a help catalog with no rail/section navigation (the register's, so far) has no use for it.
export type Category = { label: string; icon?: string };
export type CategoryRecord = Record<string, Category>;

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
