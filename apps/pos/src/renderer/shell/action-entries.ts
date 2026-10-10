import type { RegisterAbility } from "@purosur/domain";
import type { RegisteredRouter } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { CircleHelp, History } from "lucide-react";

export type ActionEntry = {
  label: string;
  icon: LucideIcon;
  ability: Exclude<RegisterAbility, "open_cash_session">;
  to: keyof RegisteredRouter["routesByPath"];
};

export const ACTION_ENTRIES: readonly ActionEntry[] = [
  { label: "Historial", icon: History, ability: "view_sales_history", to: "/history" },
  { label: "Ayuda", icon: CircleHelp, ability: "read_register_help", to: "/help" },
];

export function entriesFor(
  entries: readonly ActionEntry[],
  abilities: readonly RegisterAbility[],
): ActionEntry[] {
  return entries.filter((entry) => abilities.includes(entry.ability));
}
