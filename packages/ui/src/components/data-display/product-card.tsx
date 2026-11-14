import { Package, Scale, Tag as TagIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";
import { FigureStat } from "./figure-stat";
import { Tag } from "./tag";

export type ProductCardProps = {
  name: string;
  price: string;
  soldBy: "weight" | "unit";
  tag?: string | undefined;
  figures: { label: string; value: string }[];
  action?: ReactNode;
};

export function ProductCard({ name, price, soldBy, tag, figures, action }: ProductCardProps) {
  const nameId = useId();
  return (
    <section
      aria-labelledby={nameId}
      className="flex flex-col gap-4 rounded-lg border border-border-accent bg-surface-soft p-5"
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-surface text-text-eyebrow *:size-icon-md"
        >
          {soldBy === "weight" ? <Scale /> : <Package />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id={nameId} className="text-heading font-bold text-text">
            {name}
          </h2>
          <p className="font-mono text-detail text-text-subtle">{price}</p>
        </div>
        {tag === undefined ? null : (
          <Tag tone="success" icon={<TagIcon />}>
            {tag}
          </Tag>
        )}
      </div>
      {figures.length === 0 ? null : (
        <div className="grid auto-cols-fr grid-flow-col gap-3">
          {figures.map(({ label, value }) => (
            <div key={label} className="rounded-md bg-surface px-5 py-4">
              <FigureStat
                label={label}
                value={value}
                labelTone="warning"
                variant="plain"
                monospace
              />
            </div>
          ))}
        </div>
      )}
      {action === undefined ? null : <div className="flex">{action}</div>}
    </section>
  );
}
