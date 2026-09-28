import { PuroSurIsotype } from "@purosur/ui";
import type { ReactNode } from "react";

export type ShellProps = {
  sectionColumnLabel: string;
  railAreas: ReactNode;
  railFooter: ReactNode;
  sectionColumn: ReactNode;
  children: ReactNode;
};

export function Shell({
  sectionColumnLabel,
  railAreas,
  railFooter,
  sectionColumn,
  children,
}: ShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-soft">
      <nav
        aria-label="Áreas"
        className="flex w-20 shrink-0 flex-col items-center gap-1.5 bg-surface-nav px-3 py-4"
      >
        <PuroSurIsotype className="size-10 object-contain" />
        <div aria-hidden="true" className="h-px w-full bg-border-inverse" />
        <div className="flex flex-col items-center gap-1.5">{railAreas}</div>
        <div className="mt-auto flex flex-col items-center gap-1.5">{railFooter}</div>
      </nav>
      <nav
        aria-label={sectionColumnLabel}
        className="flex w-64 shrink-0 flex-col gap-1 border-border border-r bg-surface px-3 py-4"
      >
        {sectionColumn}
      </nav>
      {/* Not a scroll container: ScreenLayout owns each screen's one scroll region, so a
          screen's top bar and action footer can't scroll away with it. */}
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
