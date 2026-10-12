import type { ReactNode } from "react";

export type LabelledFieldListItem = {
  id: string;
  title: string;
  detail: string;
  field: ReactNode;
};

export type LabelledFieldListProps = {
  items: readonly LabelledFieldListItem[];
  monospaceTitles?: boolean;
};

export function LabelledFieldList({ items, monospaceTitles = false }: LabelledFieldListProps) {
  return (
    <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {items.map((item) => (
        <div key={item.id} className="flex flex-row items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className={`text-body font-bold text-text${monospaceTitles ? " font-mono" : ""}`}>
              {item.title}
            </span>
            <span className="text-detail text-text-subtle">{item.detail}</span>
          </div>
          <div className="w-42.5 shrink-0">{item.field}</div>
        </div>
      ))}
    </div>
  );
}
