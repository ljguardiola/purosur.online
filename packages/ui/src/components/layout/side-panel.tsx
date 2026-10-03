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
      className="flex h-full w-98 shrink-0 flex-col gap-4 border-l border-border bg-surface p-8"
    >
      {children}
      {footer === undefined ? null : <div className="mt-auto flex flex-col gap-4">{footer}</div>}
    </aside>
  );
}
