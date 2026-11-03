import type { ReactNode } from "react";

export type SidePanelProps = {
  children: ReactNode;
  label?: string | undefined;
  footer?: ReactNode | undefined;
};

export function SidePanel({ children, label, footer }: SidePanelProps) {
  return (
    <aside
      aria-label={label}
      className="flex h-full w-98 shrink-0 flex-col border-l border-border bg-surface"
    >
      <div
        className={`relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-8 pt-8 ${footer === undefined ? "pb-8" : "pb-4"}`}
      >
        {children}
      </div>
      {footer === undefined ? null : (
        <div className="flex shrink-0 flex-col gap-4 px-8 pb-8">{footer}</div>
      )}
    </aside>
  );
}
