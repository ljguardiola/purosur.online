import type { AlertAudience, AlertKind, AlertLevel } from "@purosur/domain";
import type { OpenAlertsOverview } from "@purosur/domain/alerts/use-cases";

function uniqueKindsOf(rows: readonly { kind: AlertKind }[]): AlertKind[] {
  return [...new Set(rows.map((row) => row.kind))];
}

export function openAlertsOverviewOf(
  rows: readonly { level: string; kind: AlertKind; audience: AlertAudience; openCount: number }[],
): OpenAlertsOverview {
  const overviewOf = (level: AlertLevel) => {
    const ofLevel = rows.filter((row) => row.level === level);
    return {
      openCount: ofLevel.reduce((total, row) => total + row.openCount, 0),
      kinds: uniqueKindsOf(ofLevel),
      localKinds: uniqueKindsOf(ofLevel.filter((row) => row.audience === "local")),
    };
  };
  return {
    critical: overviewOf("critical"),
    warning: overviewOf("warning"),
    informational: overviewOf("informational"),
  };
}
