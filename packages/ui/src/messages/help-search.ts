import type { HelpArticle, HelpBlock } from "./help";
import { textsContainEveryWord } from "./text-search";

function blockText(block: HelpBlock<string>): readonly string[] {
  switch (block.kind) {
    case "heading":
    case "paragraph":
    case "note":
      return [block.text];
    case "steps":
      return block.items;
    case "articleLink":
      return [];
  }
}

export function articleMatchesQuery(article: HelpArticle<string, string>, query: string): boolean {
  return textsContainEveryWord([article.title, ...article.body.flatMap(blockText)], query);
}

export function searchArticles<Articles extends Record<string, HelpArticle<string, string>>>(
  articles: Articles,
  query: string,
): Array<[Extract<keyof Articles, string>, Articles[keyof Articles]]> {
  if (query.trim() === "") {
    return [];
  }
  return Object.entries(articles).filter(([, article]) =>
    articleMatchesQuery(article, query),
  ) as Array<[Extract<keyof Articles, string>, Articles[keyof Articles]]>;
}
