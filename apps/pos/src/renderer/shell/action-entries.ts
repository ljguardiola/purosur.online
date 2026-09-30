import type { PermissionKey } from "@purosur/domain";
import type { LucideIcon } from "lucide-react";

export type ActionEntry = {
  label: string;
  icon: LucideIcon;
  permission: PermissionKey;
  opens: () => void;
};

export const ACTION_ENTRIES: readonly ActionEntry[] = [];

export function entriesFor(
  entries: readonly ActionEntry[],
  permissionKeys: readonly string[],
): ActionEntry[] {
  return entries.filter((entry) => permissionKeys.includes(entry.permission));
}
