import type { AlertKind, AlertLevel } from "@purosur/domain";
import type { OpenAlertsOverview } from "@purosur/domain/alerts/use-cases";

export function openAlertsOverviewOf(
  rows: readonly { level: string; kind: AlertKind; openCount: number }[],
): OpenAlertsOverview {
  const overviewOf = (level: AlertLevel) => {
    const ofLevel = rows.filter((row) => row.level === level);
    return {
      openCount: ofLevel.reduce((total, row) => total + row.openCount, 0),
      kinds: ofLevel.map((row) => row.kind),
    };
  };
  return {
    critical: overviewOf("critical"),
    warning: overviewOf("warning"),
    informational: overviewOf("informational"),
  };
}
