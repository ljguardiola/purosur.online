import { Info } from "lucide-react";
import type { ReactNode } from "react";
import type { HelpBlock } from "../../messages/help";
import { Eyebrow } from "../layout/eyebrow";

export interface HelpArticleBodyProps<ArticleId extends string> {
  body: readonly HelpBlock<ArticleId>[];
  renderArticleLink: (articleId: ArticleId) => ReactNode;
}

function keyed<Item>(items: readonly Item[], contentOf: (item: Item) => string): [string, Item][] {
  const occurrences = new Map<string, number>();
  return items.map((item) => {
    const content = contentOf(item);
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

function Block<ArticleId extends string>({
  block,
  renderArticleLink,
}: {
  block: HelpBlock<ArticleId>;
  renderArticleLink: (articleId: ArticleId) => ReactNode;
}) {
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
    case "articleLink":
      return renderArticleLink(block.article);
  }
}

export function HelpArticleBody<ArticleId extends string>({
  body,
  renderArticleLink,
}: HelpArticleBodyProps<ArticleId>) {
  return (
    <div className="flex flex-col gap-4">
      {keyed(body, blockContent).map(([key, block]) => (
        <Block key={key} block={block} renderArticleLink={renderArticleLink} />
      ))}
    </div>
  );
}
