export const CRITICAL_BATTERY_ACTIONS = ["do_nothing", "sleep", "hibernate", "shut_down"] as const;

export type CriticalBatteryActionKind = (typeof CRITICAL_BATTERY_ACTIONS)[number];

export type CriticalBatteryAction =
  | { kind: "unreadable" }
  | { kind: "read"; action: CriticalBatteryActionKind };

export function criticalBatteryActionShowsCondition(action: CriticalBatteryAction): boolean {
  return action.kind === "read" && action.action !== "shut_down";
}
