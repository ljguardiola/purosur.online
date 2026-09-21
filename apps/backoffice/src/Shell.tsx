import type { ReactNode } from "react";

export type ShellProps = {
  areaRailLabel: string;
  sectionColumnLabel: string;
  rail: ReactNode;
  sectionColumn: ReactNode;
  children: ReactNode;
};

/** The backoffice's three-column frame: an area rail, a section column, and the active screen's content. */
export function Shell({
  areaRailLabel,
  sectionColumnLabel,
  rail,
  sectionColumn,
  children,
}: ShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-sand">
      <nav
        aria-label={areaRailLabel}
        className="flex w-20 shrink-0 flex-col items-center gap-1.5 bg-brand-blue-strong px-3 py-4"
      >
        {rail}
      </nav>
      <nav
        aria-label={sectionColumnLabel}
        className="flex w-64 shrink-0 flex-col gap-1 border-line border-r bg-surface-white px-3 py-4"
      >
        {sectionColumn}
      </nav>
      <main className="flex flex-1 flex-col overflow-auto">{children}</main>
    </div>
  );
}
