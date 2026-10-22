import type { AlertLevel } from "@purosur/domain";
import type { NoticeTone } from "@purosur/ui";

export const ALERT_LEVEL_TONE = {
  critical: "error",
  warning: "warning",
  informational: "info",
} as const satisfies Record<AlertLevel, NoticeTone>;

export const ALERT_LEVEL_LABELS: Record<AlertLevel, string> = {
  critical: "Crítica",
  warning: "Advertencia",
  informational: "Informativa",
};
