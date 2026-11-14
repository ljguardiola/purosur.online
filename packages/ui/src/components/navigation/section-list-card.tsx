import { ChevronRight } from "lucide-react";
import { useId } from "react";
import { KeyLegend, type KeyLegendItem } from "../data-display/key-legend";
import { Eyebrow } from "../layout/eyebrow";
import { type Icon, iconSlotClassName } from "../shared/icon";
import { type Tone, toneClassName } from "../shared/tone";

export type SectionListStatus = { tone: Tone; text: string };

export type SectionListItem = {
  id: string;
  icon: Icon;
  title: string;
  statuses: readonly SectionListStatus[];
};

export type SectionListCardProps = {
  title: string;
  items: readonly SectionListItem[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  legend?: readonly KeyLegendItem[] | undefined;
};

export function SectionListCard({
  title,
  items,
  selectedId,
  onSelect,
  legend,
}: SectionListCardProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface"
    >
      <div id={headingId} className="shrink-0 border-b border-border px-4 py-3">
        <Eyebrow text={title} tone="neutral" headingLevel={2} />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {items.map((item) => (
          <SectionListRow
            key={item.id}
            item={item}
            selected={item.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </ul>
      {legend === undefined ? null : (
        <div className="shrink-0 border-t border-border bg-surface-subtle px-4 py-3">
          <KeyLegend items={legend} />
        </div>
      )}
    </section>
  );
}

function SectionListRow({
  item,
  selected,
  onSelect,
}: {
  item: SectionListItem;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(item.id)}
        className={[
          "flex w-full cursor-pointer items-center gap-4 px-4 py-4 text-left outline-none focus-visible:focus-ring-inset",
          selected
            ? "bg-action-subtle inset-shadow-divider-marker"
            : "bg-surface inset-shadow-divider hover:bg-surface-subtle",
        ].join(" ")}
      >
        <span
          aria-hidden="true"
          className={[
            "flex size-10 shrink-0 items-center justify-center rounded-full text-text",
            selected ? "bg-surface" : "bg-neutral-subtle",
          ].join(" ")}
        >
          <span className={iconSlotClassName.md}>{item.icon}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-subheading text-text">{item.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-detail text-text-subtle">
            {item.statuses.map((status, index) => (
              <span key={status.text} className="contents">
                {index > 0 ? <span aria-hidden="true">·</span> : null}
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`size-2 shrink-0 rounded-full ${toneClassName[status.tone].dot}`}
                  />
                  {status.text}
                </span>
              </span>
            ))}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="size-icon-sm shrink-0 text-text" />
      </button>
    </li>
  );
}
