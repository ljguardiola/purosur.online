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
      <div className="flex w-[680px] min-w-80 flex-col bg-surface-soft p-8">
        <div className="flex-1" />
        <PuroSurLogo className="h-auto max-h-[180px] w-full max-w-[460px] self-center object-contain" />
        <div className="flex-1" />
        <p className="text-sm font-bold text-text-subtle">Backoffice</p>
      </div>
      <main className="flex flex-1 flex-col items-center justify-center p-8">
        <div className="flex w-full max-w-[440px] flex-col gap-4">{children}</div>
      </main>
    </div>
  );
}

export type AccessHeaderProps = {
  eyebrow?: string;
  heading: string;
  description?: string;
};

export function AccessHeader({ eyebrow, heading, description }: AccessHeaderProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {eyebrow && (
        <p className="text-xs font-bold text-text-eyebrow uppercase tracking-[1.2px]">{eyebrow}</p>
      )}
      <h1 tabIndex={-1} className={`text-3xl font-bold text-text-accent ${focusRingClassName}`}>
        {heading}
      </h1>
      {description && <p className="text-base text-text-subtle">{description}</p>}
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
      className={`inline-flex items-center gap-2 self-start py-1 font-bold text-base text-text-accent ${focusRingClassName}`}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-4 shrink-0 [&>svg]:h-full [&>svg]:w-full"
      >
        {icon}
      </span>
      {label}
    </Link>
  );
}
