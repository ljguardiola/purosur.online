import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";

export type ScreenLinkProps = {
  to: "/" | "/pin-code-redemption";
  icon: ReactElement;
  label: string;
};

export function ScreenLink({ to, icon, label }: ScreenLinkProps) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 self-start py-1 font-bold text-body text-text-accent outline-none focus-visible:focus-ring-tight"
    >
      <span aria-hidden="true" className="inline-flex size-icon-sm shrink-0 *:size-full">
        {icon}
      </span>
      {label}
    </Link>
  );
}
