import type { PermissionKey } from "@purosur/domain";
import type { RegisteredRouter } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

type NoSessionPermission = Extract<
  PermissionKey,
  "view_sales_history" | "reprint_receipt" | "correct_register_clock" | "record_initial_inventory"
>;

export type ActionEntry = {
  label: string;
  icon: LucideIcon;
  permission: NoSessionPermission;
  to: keyof RegisteredRouter["routesByPath"];
};

export const ACTION_ENTRIES: readonly ActionEntry[] = [];

export function entriesFor(
  entries: readonly ActionEntry[],
  permissionKeys: readonly string[],
): ActionEntry[] {
  return entries.filter((entry) => permissionKeys.includes(entry.permission));
}
