import type { HelpArticle, HelpBlock } from "@purosur/ui";

function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function blockText(block: HelpBlock<string>): readonly string[] {
  switch (block.kind) {
    case "heading":
    case "paragraph":
    case "note":
      return [block.text];
    case "steps":
      return block.items;
    // Carries no text of its own to search: it only points at another article, whose own title
    // and body are searched on their own entry.
    case "articleLink":
      return [];
  }
}

/** Whether `query` appears, case- and accent-insensitively, in the article's title or body text. */
export function articleMatchesQuery(article: HelpArticle<string, string>, query: string): boolean {
  const needle = normalizeForSearch(query);
  if (normalizeForSearch(article.title).includes(needle)) {
    return true;
  }
  return article.body.some((block) =>
    blockText(block).some((text) => normalizeForSearch(text).includes(needle)),
  );
}

/** Every [id, article] pair matching `query`, in catalog order. A blank query matches nothing. */
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
