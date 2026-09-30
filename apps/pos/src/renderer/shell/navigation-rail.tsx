import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { House, LogOut } from "lucide-react";
import type { ActionEntry } from "./action-entries";

type RailItemProps = {
  label: string;
  icon: LucideIcon;
  current?: boolean;
};

const itemClassName =
  "flex w-18 cursor-pointer flex-col items-center gap-1 rounded-lg py-3 text-caption focus-visible:focus-ring";

function itemClassNameFor(current: boolean): string {
  return [
    itemClassName,
    current
      ? "bg-action-subtle font-bold text-text-accent"
      : "text-text-subtle hover:bg-surface-subtle",
  ].join(" ");
}

function RailItemContent({ label, icon: Glyph }: RailItemProps) {
  return (
    <>
      <Glyph aria-hidden="true" className="size-icon-xl" />
      {label}
    </>
  );
}

function RailButton({
  label,
  icon,
  current = false,
  onPress,
}: RailItemProps & { onPress: () => void }) {
  return (
    <button
      type="button"
      aria-current={current ? "page" : undefined}
      onClick={onPress}
      className={itemClassNameFor(current)}
    >
      <RailItemContent label={label} icon={icon} />
    </button>
  );
}

export type NavigationRailProps = {
  firstName: string;
  entries: readonly ActionEntry[];
  home?: { label: string; icon: LucideIcon };
  onSignOut?: () => void;
};

const INICIO = { label: "Inicio", icon: House };

export function NavigationRail({
  firstName,
  entries,
  home = INICIO,
  onSignOut,
}: NavigationRailProps) {
  return (
    <nav
      aria-label="Menú de la caja"
      className="flex h-full w-22 shrink-0 flex-col items-center gap-2 overflow-hidden border-r border-border bg-surface py-4"
    >
      <RailButton label={home.label} icon={home.icon} current onPress={() => {}} />
      {entries.map((entry) => (
        <Link key={entry.label} to={entry.to} className={itemClassNameFor(false)}>
          <RailItemContent label={entry.label} icon={entry.icon} />
        </Link>
      ))}
      <div className="flex-1" />
      <p className="w-full truncate px-2 text-center text-caption font-semibold text-text-subtle">
        {firstName}
      </p>
      {onSignOut === undefined ? null : (
        <RailButton label="Salir" icon={LogOut} onPress={onSignOut} />
      )}
    </nav>
  );
}
