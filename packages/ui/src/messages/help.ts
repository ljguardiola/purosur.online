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

// `Articles`' own constraint refers to `keyof Articles`, so a `category`, `related`, or
// `articleLink.article` that isn't one of this same call's ids fails to compile.
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
