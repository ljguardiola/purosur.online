import { PuroSurLogo } from "@purosur/ui";
import type { ReactElement, ReactNode } from "react";
import { linkProps } from "./linkProps";
import { messages } from "./messages";

export type AccessLayoutProps = {
  children: ReactNode;
};

/** The access screens' own frame, outside the Shell. */
export function AccessLayout({ children }: AccessLayoutProps) {
  return (
    <div className="flex h-screen w-screen bg-surface-white">
      {/* 680px as a shrinkable flex-basis rather than a fixed width: these screens are
          desktop-only, but a fixed, non-shrinking panel would force the same horizontal scroll
          BrandPanelScreen.tsx (the POS's own two-panel access layout) avoids. min-w-80 keeps the
          same usable floor at narrower widths. */}
      <div className="flex w-[680px] min-w-80 flex-col bg-surface-sand p-8">
        <div className="flex-1" />
        <PuroSurLogo
          alt={messages.shell.brandName}
          className="h-auto max-h-[180px] w-full max-w-[460px] self-center object-contain"
        />
        <div className="flex-1" />
        <p className="text-sm font-bold text-ink-secondary">{messages.access.brandCaption}</p>
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

/** The eyebrow/heading/description block every access screen's content opens with. */
export function AccessHeader({ eyebrow, heading, description }: AccessHeaderProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {eyebrow && (
        <p className="text-xs font-bold text-brand-earth-ui uppercase tracking-[1.2px]">
          {eyebrow}
        </p>
      )}
      <h1 className="text-3xl font-bold text-brand-blue-strong">{heading}</h1>
      {description && <p className="text-base text-ink-secondary">{description}</p>}
    </div>
  );
}

export type AccessFooterLinkProps = {
  to: string;
  icon: ReactElement;
  label: string;
};

/** A footer link to another access screen, such as the lost-passkeys link or the way back to sign-in. */
export function AccessFooterLink({ to, icon, label }: AccessFooterLinkProps) {
  return (
    <a
      {...linkProps(to)}
      className="inline-flex items-center gap-2 self-start py-1 font-bold text-base text-brand-blue-strong outline-none focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-brand-blue-strong"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-4 shrink-0 [&>svg]:h-full [&>svg]:w-full"
      >
        {icon}
      </span>
      {label}
    </a>
  );
}
