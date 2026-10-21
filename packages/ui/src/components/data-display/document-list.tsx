import type { ReactNode } from "react";

export type DocumentRowProps = {
  title: string;
  detail: string;
  status: ReactNode;
};

export type DocumentListProps = {
  label: string;
  rows: readonly [DocumentRowProps, ...DocumentRowProps[]];
};

export function DocumentList({ label, rows }: DocumentListProps) {
  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {rows.map(({ title, detail, status }) => (
        <li
          key={title}
          className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3"
        >
          <div className="flex min-w-0 flex-col">
            <span className="text-body font-semibold text-text">{title}</span>
            <span className="text-detail text-text-subtle">{detail}</span>
          </div>
          {status}
        </li>
      ))}
    </ul>
  );
}
