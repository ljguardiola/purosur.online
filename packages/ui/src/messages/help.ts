import type { Locale } from "./formatters";

export type CategoryRecord = Record<string, string>;

// A closed union, not an open `{ kind: string; ... }` shape: adding a new block kind means adding
// a case here, so every place that renders a HelpBlock is forced to handle it.
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

// `Articles`' own constraint refers to `keyof Articles`, so each article's `category` is checked
// against the categories this same call defines, and each `related`/`articleLink.article` is
// checked against the articles this same call defines — a reference to an id that doesn't exist
// fails to compile instead of failing at runtime. `NoInfer` on both keeps a leaf's own `category`
// or `related` value from ever widening the id unions being checked against (see
// OptionCardGroup.tsx for the same technique with a single type parameter).
export function defineHelp<
  const Categories extends CategoryRecord,
  const Articles extends Record<
    string,
    HelpArticle<
      NoInfer<Extract<keyof Categories, string>>,
      NoInfer<Extract<keyof Articles, string>>
    >
  >,
>(_locale: Locale, content: HelpCatalog<Categories, Articles>): HelpCatalog<Categories, Articles> {
  return content;
}
