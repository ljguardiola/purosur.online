import { AreaNavButton, AreaNavItem, PuroSurIsotype } from "@purosur/ui";
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
  entries: readonly ActionEntry[];
  current?: ActionEntry["to"];
  home?: { label: string; icon: LucideIcon; to?: ActionEntry["to"] };
  links?: readonly RailLinkProps[];
  onSignOut?: () => void;
};

const INICIO = { label: "Inicio", icon: House };

export function NavigationRail({
  entries,
  current,
  home = INICIO,
  links = [],
  onSignOut,
}: NavigationRailProps) {
  const HomeGlyph = home.icon;
  return (
    <nav
      aria-label="Menú de la caja"
      className="flex h-full w-18 shrink-0 flex-col items-center gap-2 overflow-hidden bg-surface-nav py-4"
    >
      <PuroSurIsotype className="mb-2 size-10 object-contain" />
      {home.to === undefined ? (
        <AreaNavButton
          rail="dark"
          label={home.label}
          icon={<HomeGlyph />}
          active
          onPress={() => {}}
        />
      ) : (
        <RailLink rail="dark" to={home.to} label={home.label} icon={<HomeGlyph />} active={false} />
      )}
      {entries.map(({ label, icon: Glyph, to }) => (
        <RailLink
          key={label}
          rail="dark"
          to={to}
          label={label}
          icon={<Glyph />}
          active={to === current}
        />
      ))}
      {links.map(({ label, icon: Glyph, to, current = false }) => (
        <RailLink key={label} rail="dark" to={to} label={label} icon={<Glyph />} active={current} />
      ))}
      <div className="flex-1" />
      {onSignOut === undefined ? null : (
        <AreaNavButton
          rail="dark"
          label="Salir"
          icon={<LogOut />}
          active={false}
          onPress={onSignOut}
        />
      )}
    </nav>
  );
}
