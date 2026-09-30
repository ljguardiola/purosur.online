import type { LucideIcon } from "lucide-react";
import { House, LogOut } from "lucide-react";
import type { ActionEntry } from "./action-entries";

type RailItemProps = {
  label: string;
  icon: LucideIcon;
  current?: boolean;
  onPress: () => void;
};

const itemClassName =
  "flex w-18 cursor-pointer flex-col items-center gap-1 rounded-lg py-3 text-caption focus-visible:focus-ring";

function RailItem({ label, icon: Glyph, current = false, onPress }: RailItemProps) {
  return (
    <button
      type="button"
      aria-current={current ? "page" : undefined}
      onClick={onPress}
      className={[
        itemClassName,
        current
          ? "bg-action-subtle font-bold text-text-accent"
          : "text-text-subtle hover:bg-surface-subtle",
      ].join(" ")}
    >
      <Glyph aria-hidden="true" className="size-icon-xl" />
      {label}
    </button>
  );
}

export type NavigationRailProps = {
  firstName: string;
  entries: readonly ActionEntry[];
  onSignOut: () => void;
};

export function NavigationRail({ firstName, entries, onSignOut }: NavigationRailProps) {
  return (
    <nav
      aria-label="Menú de la caja"
      className="flex h-full w-22 shrink-0 flex-col items-center gap-2 overflow-hidden border-r border-border bg-surface py-4"
    >
      <RailItem label="Inicio" icon={House} current onPress={() => {}} />
      {entries.map((entry) => (
        <RailItem key={entry.label} label={entry.label} icon={entry.icon} onPress={entry.opens} />
      ))}
      <div className="flex-1" />
      <p className="w-full truncate px-2 text-center text-caption font-semibold text-text-subtle">
        {firstName}
      </p>
      <RailItem label="Salir" icon={LogOut} onPress={onSignOut} />
    </nav>
  );
}
