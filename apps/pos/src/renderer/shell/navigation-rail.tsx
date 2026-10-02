import { AreaNavButton, AreaNavItem } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { House, LogOut } from "lucide-react";
import type { ActionEntry } from "./action-entries";

const RailLink = createLink(AreaNavItem);

type RailLinkProps = {
  label: string;
  icon: LucideIcon;
  to: ActionEntry["to"];
  current?: boolean;
};

export type NavigationRailProps = {
  firstName: string;
  entries: readonly ActionEntry[];
  home?: { label: string; icon: LucideIcon; to?: ActionEntry["to"] };
  links?: readonly RailLinkProps[];
  onSignOut?: () => void;
};

const INICIO = { label: "Inicio", icon: House };

export function NavigationRail({
  firstName,
  entries,
  home = INICIO,
  links = [],
  onSignOut,
}: NavigationRailProps) {
  const HomeGlyph = home.icon;
  return (
    <nav
      aria-label="Menú de la caja"
      className="flex h-full w-22 shrink-0 flex-col items-center gap-2 overflow-hidden border-r border-border bg-surface py-4"
    >
      {home.to === undefined ? (
        <AreaNavButton
          rail="light"
          label={home.label}
          icon={<HomeGlyph />}
          active
          onPress={() => {}}
        />
      ) : (
        <RailLink
          rail="light"
          to={home.to}
          label={home.label}
          icon={<HomeGlyph />}
          active={false}
        />
      )}
      {entries.map(({ label, icon: Glyph, to }) => (
        <RailLink key={label} rail="light" to={to} label={label} icon={<Glyph />} active={false} />
      ))}
      {links.map(({ label, icon: Glyph, to, current = false }) => (
        <RailLink
          key={label}
          rail="light"
          to={to}
          label={label}
          icon={<Glyph />}
          active={current}
        />
      ))}
      <div className="flex-1" />
      <p className="w-full truncate px-2 text-center text-caption font-semibold text-text-subtle">
        {firstName}
      </p>
      {onSignOut === undefined ? null : (
        <AreaNavButton
          rail="light"
          label="Salir"
          icon={<LogOut />}
          active={false}
          onPress={onSignOut}
        />
      )}
    </nav>
  );
}
