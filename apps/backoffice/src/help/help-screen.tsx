import type { HelpArticle, HelpBlock } from "@purosur/ui";
import { Eyebrow, SearchField } from "@purosur/ui";
import { Link, useRouter } from "@tanstack/react-router";
import { ChevronRight, Info, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { focusRingClassName } from "../platform/focus-ring";
import { useDocumentTitle } from "../shell/document-title";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import type { BackofficeHelpCatalog } from "./help-catalog";
import { searchArticles } from "./search-help";

function ownEntry<Value>(record: Record<string, Value>, key: string | null): Value | undefined {
  return key !== null && Object.hasOwn(record, key) ? record[key] : undefined;
}

const linkRowClassName =
  "flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-3 " +
  `text-detail text-text transition-colors hover:bg-surface-subtle ${focusRingClassName}`;

function ArticleLinkRow({
  articleId,
  article,
}: {
  articleId: string;
  article: HelpArticle<string, string>;
}) {
  return (
    <Link
      to="/help/$categoryId/$articleId"
      params={{ categoryId: article.category, articleId }}
      className={linkRowClassName}
    >
      <span>{article.title}</span>
      <ChevronRight aria-hidden="true" className="size-icon-sm shrink-0 text-text-subtle" />
    </Link>
  );
}

function EmptyState({ title, body }: { title?: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface px-6 py-12 text-center">
      {title ? <p className="text-text-accent text-subheading">{title}</p> : null}
      <p className="text-text-subtle text-detail">{body}</p>
    </div>
  );
}

type ArticleEntry = [string, HelpArticle<string, string>];

function keyed<Item>(items: readonly Item[], keyOf: (item: Item) => string): Array<[string, Item]> {
  const occurrences = new Map<string, number>();
  return items.map((item) => {
    const content = keyOf(item);
    const occurrence = (occurrences.get(content) ?? 0) + 1;
    occurrences.set(content, occurrence);
    return [`${occurrence}:${content}`, item];
  });
}

function blockContent(block: HelpBlock<string>): string {
  switch (block.kind) {
    case "heading":
    case "paragraph":
    case "note":
      return `${block.kind}:${block.text}`;
    case "steps":
      return `steps:${JSON.stringify(block.items)}`;
    case "articleLink":
      return `articleLink:${block.article}`;
  }
}

function ArticleList({ articles }: { articles: readonly ArticleEntry[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {articles.map(([id, article]) => (
        <li key={id}>
          <ArticleLinkRow articleId={id} article={article} />
        </li>
      ))}
    </ul>
  );
}

function Block({ block, help }: { block: HelpBlock<string>; help: BackofficeHelpCatalog }) {
  switch (block.kind) {
    case "heading":
      return <Eyebrow text={block.text} headingLevel={2} />;
    case "paragraph":
      return <p className="text-body text-text">{block.text}</p>;
    case "steps":
      return (
        <ol className="flex flex-col gap-3">
          {keyed(block.items, (item) => item).map(([key, item], index) => (
            <li key={key} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-action-subtle font-bold text-text-accent text-detail"
              >
                {index + 1}
              </span>
              <p className="badge-text-offset text-body text-text leading-lg">{item}</p>
            </li>
          ))}
        </ol>
      );
    case "note":
      return (
        <div className="flex items-center gap-3 rounded-lg bg-surface-subtle px-4 py-3">
          <Info aria-hidden="true" className="size-icon-md shrink-0 text-text-accent" />
          <p className="text-text text-detail leading-md">{block.text}</p>
        </div>
      );
    case "articleLink": {
      const linked = ownEntry(help.articles, block.article);
      return linked ? <ArticleLinkRow articleId={block.article} article={linked} /> : null;
    }
  }
}

function RelatedPanel({
  help,
  relatedIds,
}: {
  help: BackofficeHelpCatalog;
  relatedIds: readonly string[];
}) {
  const related = relatedIds.flatMap((id): ArticleEntry[] => {
    const article = ownEntry(help.articles, id);
    return article ? [[id, article]] : [];
  });
  return (
    <nav
      aria-label="También te puede servir"
      className="flex w-75 shrink-0 flex-col gap-2 self-start"
    >
      <Eyebrow text="También te puede servir" headingLevel={2} />
      <ul className="flex flex-col gap-2">
        {keyed(related, ([id]) => id).map(([key, [id, article]]) => (
          <li key={key}>
            <ArticleLinkRow articleId={id} article={article} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ArticleView({
  help,
  article,
}: {
  help: BackofficeHelpCatalog;
  article: HelpArticle<string, string>;
}) {
  return (
    <div className="flex flex-1 gap-6">
      <div className="flex flex-1 flex-col gap-4 rounded-lg border border-border bg-surface p-6">
        {keyed(article.body, blockContent).map(([key, block]) => (
          <Block key={key} block={block} help={help} />
        ))}
      </div>
      {article.related && article.related.length > 0 && (
        <RelatedPanel help={help} relatedIds={article.related} />
      )}
    </div>
  );
}

export type HelpContentProps = {
  help: BackofficeHelpCatalog;
  categoryId: string | null;
  articleId: string | null;
  search: string;
  onSearchChange: (value: string) => void;
};

export function HelpContent({
  help,
  categoryId,
  articleId,
  search,
  onSearchChange,
}: HelpContentProps) {
  const activeCategory = ownEntry(help.categories, categoryId);
  const activeArticle = ownEntry(help.articles, articleId);
  const isSearching = search.trim() !== "";
  const results = isSearching ? searchArticles(help.articles, search) : [];
  const hasArticles = Object.keys(help.articles).length > 0;
  const idleTitle = hasArticles ? "Elegí una sección" : "Todavía no hay contenido de ayuda";

  return (
    <ScreenLayout
      topBar={
        <div className="flex h-18 shrink-0 flex-col justify-center border-border border-b bg-surface px-8">
          {activeArticle && activeCategory ? (
            <p className="text-text-subtle text-detail">{`Ayuda · ${activeCategory.label}`}</p>
          ) : null}
          <ScreenTitle>{activeArticle?.title ?? activeCategory?.label ?? idleTitle}</ScreenTitle>
        </div>
      }
      bodyClassName="gap-4 p-6"
    >
      <div className="w-105">
        <SearchField
          value={search}
          onChange={onSearchChange}
          placeholder="Buscar en la ayuda"
          icon={<Search />}
        />
      </div>
      {isSearching ? (
        results.length > 0 ? (
          <ArticleList articles={results} />
        ) : (
          <EmptyState title="Sin resultados" body="Probá con otras palabras." />
        )
      ) : activeArticle ? (
        <ArticleView help={help} article={activeArticle} />
      ) : activeCategory && categoryId ? (
        <ArticleList
          articles={Object.entries(help.articles).filter(
            ([, article]) => article.category === categoryId,
          )}
        />
      ) : (
        <EmptyState
          body={
            hasArticles
              ? "O buscá un tema."
              : "Cuando se sumen funciones nuevas, sus artículos van a aparecer acá."
          }
        />
      )}
    </ScreenLayout>
  );
}

function documentTitle(
  help: BackofficeHelpCatalog,
  categoryId: string | null,
  articleId: string | null,
): string {
  const page =
    ownEntry(help.articles, articleId)?.title ?? ownEntry(help.categories, categoryId)?.label;
  return page ? `${page} · Ayuda · Puro Sur` : "Ayuda · Puro Sur";
}

export type HelpScreenProps = {
  help: BackofficeHelpCatalog;
  categoryId: string | null;
  articleId: string | null;
};

export function HelpScreen({ help, categoryId, articleId }: HelpScreenProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const page = `${categoryId}/${articleId}`;

  useDocumentTitle(documentTitle(help, categoryId, articleId));

  useEffect(() => router.subscribe("onBeforeNavigate", () => setSearch("")), [router]);

  return (
    <HelpContent
      key={page}
      help={help}
      categoryId={categoryId}
      articleId={articleId}
      search={search}
      onSearchChange={setSearch}
    />
  );
}
