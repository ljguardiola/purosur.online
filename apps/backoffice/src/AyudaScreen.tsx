import type { CategoryRecord, HelpArticle, HelpBlock, HelpCatalog } from "@purosur/ui";
import { SearchField, SectionNavItem } from "@purosur/ui";
import { ChevronRight, Info, Search } from "lucide-react";
import { articleHref, sectionHref } from "./ayudaRoutes";
import { linkProps } from "./linkProps";
import { messages } from "./messages";
import { searchArticles } from "./searchHelp";
import { sectionIcon } from "./sectionIcons";

export type AyudaHelpCatalog = HelpCatalog<
  CategoryRecord,
  Record<string, HelpArticle<string, string>>
>;

const linkRowClassName =
  "flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-white px-3 py-3 " +
  "text-sm text-ink outline-none transition-colors hover:bg-surface-bone " +
  "focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 " +
  "focus-visible:outline-brand-blue-strong";

function LinkRow({ to, label }: { to: string; label: string }) {
  return (
    <a {...linkProps(to)} className={linkRowClassName}>
      <span>{label}</span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-secondary" />
    </a>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-line bg-surface-white px-6 py-12 text-center">
      <p className="font-bold text-brand-blue-strong text-lg">{title}</p>
      <p className="text-ink-secondary text-sm">{body}</p>
    </div>
  );
}

type ArticleEntry = [string, HelpArticle<string, string>];

function ArticleList({ articles }: { articles: readonly ArticleEntry[] }) {
  return (
    <div className="flex flex-col gap-2">
      {articles.map(([id, article]) => (
        <LinkRow key={id} to={articleHref(article.category, id)} label={article.title} />
      ))}
    </div>
  );
}

// A stable identity for a body block that never relies on its position, since a heading or note
// could be reordered without changing what it says.
function blockKey(block: HelpBlock<string>): string {
  switch (block.kind) {
    case "heading":
    case "paragraph":
    case "note":
      return `${block.kind}:${block.text}`;
    case "steps":
      return `steps:${block.items.join("|")}`;
    case "articleLink":
      return `articleLink:${block.article}`;
  }
}

function Block({ block, help }: { block: HelpBlock<string>; help: AyudaHelpCatalog }) {
  switch (block.kind) {
    case "heading":
      return (
        <p className="font-bold text-brand-earth-ui text-xs uppercase tracking-widest">
          {block.text}
        </p>
      );
    case "paragraph":
      return <p className="text-base text-ink leading-[1.5]">{block.text}</p>;
    case "steps":
      return (
        <div className="flex flex-col gap-3">
          {block.items.map((item, index) => (
            <div key={item} className="flex items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-blue-message-bg font-bold text-brand-blue-strong text-sm">
                {index + 1}
              </span>
              <p className="text-base text-ink leading-[1.45]">{item}</p>
            </div>
          ))}
        </div>
      );
    case "note":
      return (
        <div className="flex items-start gap-3 rounded-lg bg-surface-bone px-4 py-3">
          <Info aria-hidden="true" className="size-[1.125rem] shrink-0 text-brand-blue-strong" />
          <p className="text-ink text-sm leading-[1.4]">{block.text}</p>
        </div>
      );
    case "articleLink": {
      const linked = help.articles[block.article];
      return linked ? (
        <LinkRow to={articleHref(linked.category, block.article)} label={linked.title} />
      ) : null;
    }
  }
}

function RelatedPanel({
  help,
  relatedIds,
}: {
  help: AyudaHelpCatalog;
  relatedIds: readonly string[];
}) {
  return (
    <nav
      aria-label={messages.ayuda.relatedHeading}
      className="flex w-[18.75rem] shrink-0 flex-col gap-2"
    >
      <p className="font-bold text-brand-earth-ui text-xs uppercase tracking-widest">
        {messages.ayuda.relatedHeading}
      </p>
      {relatedIds.map((id) => {
        const article = help.articles[id];
        return article ? (
          <LinkRow key={id} to={articleHref(article.category, id)} label={article.title} />
        ) : null;
      })}
    </nav>
  );
}

function ArticleView({
  help,
  article,
}: {
  help: AyudaHelpCatalog;
  article: HelpArticle<string, string>;
}) {
  return (
    <div className="flex gap-6">
      <div className="flex flex-1 flex-col gap-4 rounded-lg border border-line bg-surface-white p-6">
        {article.body.map((block) => (
          <Block key={blockKey(block)} block={block} help={help} />
        ))}
      </div>
      {article.related && article.related.length > 0 && (
        <RelatedPanel help={help} relatedIds={article.related} />
      )}
    </div>
  );
}

export type AyudaSectionColumnProps = {
  help: AyudaHelpCatalog;
  activeCategoryId: string | null;
};

/** The section column's content: every help category as a nav row, for Shell's sectionColumn slot. */
export function AyudaSectionColumn({ help, activeCategoryId }: AyudaSectionColumnProps) {
  return (
    <>
      <h2 className="font-bold text-brand-blue-strong text-xl">{messages.ayuda.sectionsHeading}</h2>
      <div className="h-2.5" />
      {Object.entries(help.categories).map(([id, category]) => (
        <SectionNavItem
          key={id}
          label={category.label}
          icon={sectionIcon(category.icon)}
          active={id === activeCategoryId}
          {...linkProps(sectionHref(id))}
        />
      ))}
    </>
  );
}

export type AyudaContentProps = {
  help: AyudaHelpCatalog;
  categoryId: string | null;
  articleId: string | null;
  search: string;
  onSearchChange: (value: string) => void;
};

/** The Ayuda screen's own content: search, and whatever the current route/search selects, for Shell's children slot. */
export function AyudaContent({
  help,
  categoryId,
  articleId,
  search,
  onSearchChange,
}: AyudaContentProps) {
  const activeCategory = categoryId ? help.categories[categoryId] : undefined;
  const activeArticle = articleId ? help.articles[articleId] : undefined;
  const isSearching = search.trim() !== "";
  const results = isSearching ? searchArticles(help.articles, search) : [];

  return (
    <>
      <div className="flex h-18 shrink-0 items-center gap-4 border-line border-b bg-surface-white px-8">
        {activeCategory && (
          <p className="text-ink-secondary text-sm">
            {messages.ayuda.breadcrumb({ section: activeCategory.label })}
          </p>
        )}
        {activeArticle && (
          <h1 className="font-bold text-2xl text-brand-blue-strong">{activeArticle.title}</h1>
        )}
      </div>
      <div className="flex flex-col gap-4 p-6">
        <div className="w-[26.25rem]">
          <SearchField
            variant="backoffice"
            value={search}
            onChange={onSearchChange}
            placeholder={messages.ayuda.searchPlaceholder}
            icon={<Search />}
          />
        </div>
        {isSearching ? (
          results.length > 0 ? (
            <ArticleList articles={results} />
          ) : (
            <EmptyState title={messages.ayuda.noResultsTitle} body={messages.ayuda.noResultsBody} />
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
          <EmptyState title={messages.ayuda.emptyTitle} body={messages.ayuda.emptyBody} />
        )}
      </div>
    </>
  );
}
