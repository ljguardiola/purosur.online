import type { Icon, KeyName } from "@purosur/ui";
import { ButtonLink } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";

const RouterButtonLink = createLink(ButtonLink);

export type ScreenLinkProps = {
  to: "/sign-in" | "/pin-code-redemption" | "/first-sign-in" | "/locked" | "/locked-close";
  icon: Icon;
  label: string;
  keycap?: KeyName;
};

export function ScreenLink({ to, icon, label, keycap }: ScreenLinkProps) {
  return (
    <div className="self-start">
      <RouterButtonLink
        to={to}
        variant="text"
        icon={icon}
        {...(keycap === undefined ? {} : { keycap })}
      >
        {label}
      </RouterButtonLink>
    </div>
  );
}
