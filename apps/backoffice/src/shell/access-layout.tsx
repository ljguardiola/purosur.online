import { PuroSurLogo } from "@purosur/ui";
import { Link } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { focusRingClassName } from "../platform/focus-ring";

export type AccessLayoutProps = {
  children: ReactNode;
};

export function AccessLayout({ children }: AccessLayoutProps) {
  return (
    <div className="flex h-screen w-screen bg-surface">
      {/* Shrinkable flex-basis, not a fixed width: a non-shrinking panel would force horizontal
          scroll. min-w-80 keeps a usable floor at narrower widths. */}
      <div className="flex w-170 min-w-80 flex-col bg-surface-soft p-8">
        <div className="flex-1" />
        <PuroSurLogo className="h-auto max-h-45 w-full max-w-115 self-center object-contain" />
        <div className="flex-1" />
        <p className="text-detail font-bold text-text-subtle">Backoffice</p>
      </div>
      <main className="flex flex-1 flex-col items-center justify-center p-8">
        <div className="flex w-full max-w-110 flex-col gap-4">{children}</div>
      </main>
    </div>
  );
}

export type AccessFooterLinkProps = {
  to: "/sign-in" | "/account-recovery";
  icon: ReactElement;
  label: string;
};

export function AccessFooterLink({ to, icon, label }: AccessFooterLinkProps) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 self-start py-1 font-bold text-body text-text-accent ${focusRingClassName}`}
    >
      <span aria-hidden="true" className="inline-flex size-icon-sm shrink-0 *:size-full">
        {icon}
      </span>
      {label}
    </Link>
  );
}
