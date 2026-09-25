import type { HelpArticle, HelpBlock } from "@purosur/ui";
import { SearchField, SectionNavItem } from "@purosur/ui";
import { ChevronRight, Info, Search } from "lucide-react";
import type { Ref } from "react";
import { articleHref, type BackofficeHelpCatalog, sectionHref } from "./helpRoutes";
import { linkProps } from "./linkProps";
import { messages } from "./messages";
import { ScreenLayout } from "./ScreenLayout";
import { searchArticles } from "./searchHelp";
import { sectionIcon } from "./sectionIcons";

function ownEntry<Value>(record: Record<string, Value>, key: string | null): Value | undefined {
  return key !== null && Object.hasOwn(record, key) ? record[key] : undefined;
}

const focusRingClassName =
  "outline-none focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 " +
  "focus-visible:outline-brand-blue-strong";

const linkRowClassName =
  "flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-white px-3 py-3 " +
  `text-sm text-ink transition-colors hover:bg-surface-bone ${focusRingClassName}`;

function LinkRow({ to, label }: { to: string; label: string }) {
  return (
    <a {...linkProps(to)} className={linkRowClassName}>
      <span>{label}</span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-secondary" />
    </a>
  );
}

function EmptyState({ title, body }: { title?: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-line bg-surface-white px-6 py-12 text-center">
      {title && <p className="font-bold text-brand-blue-strong text-lg">{title}</p>}
      <p className="text-ink-secondary text-sm">{body}</p>
    </div>
  );
}

type ArticleEntry = [string, HelpArticle<string, string>];

/** Pairs each item with a React key, numbering repeated content so identical items stay distinct. */
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
          <LinkRow to={articleHref(article.category, id)} label={article.title} />
        </li>
      ))}
    </ul>
  );
}

function Block({ block, help }: { block: HelpBlock<string>; help: BackofficeHelpCatalog }) {
  switch (block.kind) {
    case "heading":
      return (
        <h2 className="font-bold text-brand-earth-ui text-xs uppercase tracking-widest">
          {block.text}
        </h2>
      );
    case "paragraph":
      return <p className="text-base text-ink leading-[1.5]">{block.text}</p>;
    case "steps":
      return (
        <ol className="flex flex-col gap-3">
          {keyed(block.items, (item) => item).map(([key, item], index) => (
            <li key={key} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-blue-message-bg font-bold text-brand-blue-strong text-sm"
              >
                {index + 1}
              </span>
              <p className="mt-[calc((1.75rem_-_1.45em)_/_2)] text-base text-ink leading-[1.45]">
                {item}
              </p>
            </li>
          ))}
        </ol>
      );
    case "note":
      return (
        <div className="flex items-center gap-3 rounded-lg bg-surface-bone px-4 py-3">
          <Info aria-hidden="true" className="size-[1.125rem] shrink-0 text-brand-blue-strong" />
          <p className="text-ink text-sm leading-[1.4]">{block.text}</p>
        </div>
      );
    case "articleLink": {
      const linked = ownEntry(help.articles, block.article);
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
  help: BackofficeHelpCatalog;
  relatedIds: readonly string[];
}) {
  const related = relatedIds.flatMap((id): ArticleEntry[] => {
    const article = ownEntry(help.articles, id);
    return article ? [[id, article]] : [];
  });
  return (
    <nav
      aria-label={messages.help.relatedHeading}
      className="flex w-[18.75rem] shrink-0 flex-col gap-2 self-start"
    >
      <h2 className="font-bold text-brand-earth-ui text-xs uppercase tracking-widest">
        {messages.help.relatedHeading}
      </h2>
      <ul className="flex flex-col gap-2">
        {keyed(related, ([id]) => id).map(([key, [id, article]]) => (
          <li key={key}>
            <LinkRow to={articleHref(article.category, id)} label={article.title} />
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
      <div className="flex flex-1 flex-col gap-4 rounded-lg border border-line bg-surface-white p-6">
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

export type HelpSectionColumnProps = {
  help: BackofficeHelpCatalog;
  activeCategoryId: string | null;
};

/** The section column's content: every help category as a nav row, for Shell's sectionColumn slot. */
export function HelpSectionColumn({ help, activeCategoryId }: HelpSectionColumnProps) {
  return (
    <>
      <h2 className="font-bold text-brand-blue-strong text-xl">{messages.help.sectionsHeading}</h2>
      <div className="h-2.5" />
      <ul className="flex flex-col gap-1">
        {Object.entries(help.categories).map(([id, category]) => (
          <li key={id}>
            <SectionNavItem
              label={category.label}
              icon={sectionIcon(category.icon)}
              active={id === activeCategoryId}
              {...linkProps(sectionHref(id))}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

export type HelpContentProps = {
  help: BackofficeHelpCatalog;
  categoryId: string | null;
  articleId: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  headingRef?: Ref<HTMLHeadingElement>;
};

/** The help screen's own content: search, and whatever the current route/search selects, for Shell's children slot. */
export function HelpContent({
  help,
  categoryId,
  articleId,
  search,
  onSearchChange,
  headingRef,
}: HelpContentProps) {
  const activeCategory = ownEntry(help.categories, categoryId);
  const activeArticle = ownEntry(help.articles, articleId);
  const isSearching = search.trim() !== "";
  const results = isSearching ? searchArticles(help.articles, search) : [];
  const hasArticles = Object.keys(help.articles).length > 0;
  const idleTitle = hasArticles ? messages.help.pickSectionTitle : messages.help.emptyTitle;

  return (
    <ScreenLayout
      topBar={
        <div className="flex h-18 shrink-0 flex-col justify-center border-line border-b bg-surface-white px-8">
          {activeArticle && activeCategory && (
            <p className="text-ink-secondary text-sm">
              {messages.help.breadcrumb({ section: activeCategory.label })}
            </p>
          )}
          <h1
            ref={headingRef}
            tabIndex={-1}
            className={`font-bold text-2xl text-brand-blue-strong ${focusRingClassName}`}
          >
            {activeArticle?.title ?? activeCategory?.label ?? idleTitle}
          </h1>
        </div>
      }
      bodyClassName="gap-4 p-6"
    >
      <div className="w-[26.25rem]">
        <SearchField
          variant="backoffice"
          value={search}
          onChange={onSearchChange}
          placeholder={messages.help.searchPlaceholder}
          icon={<Search />}
        />
      </div>
      {isSearching ? (
        results.length > 0 ? (
          <ArticleList articles={results} />
        ) : (
          <EmptyState title={messages.help.noResultsTitle} body={messages.help.noResultsBody} />
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
        <EmptyState body={hasArticles ? messages.help.pickSectionBody : messages.help.emptyBody} />
      )}
    </ScreenLayout>
  );
}
