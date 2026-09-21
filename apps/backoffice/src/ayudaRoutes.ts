export type AyudaRoute = {
  categoryId: string | null;
  articleId: string | null;
};

export function sectionHref(categoryId: string): string {
  return `/ayuda/${categoryId}`;
}

export function articleHref(categoryId: string, articleId: string): string {
  return `/ayuda/${categoryId}/${articleId}`;
}

/** Reads the /ayuda[/:category[/:article]] URL scheme back out of a router path. */
export function parseAyudaRoute(path: string): AyudaRoute {
  const [, , categoryId, articleId] = path.split("/");
  return { categoryId: categoryId || null, articleId: articleId || null };
}
