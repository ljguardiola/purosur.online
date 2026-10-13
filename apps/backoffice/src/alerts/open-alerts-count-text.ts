import { formatNumber, plural } from "@purosur/ui";

export function openAlertsCountText(openCount: number): string {
  return plural(openCount, {
    one: "1 alerta abierta",
    other: `${formatNumber(openCount)} alertas abiertas`,
  });
}
