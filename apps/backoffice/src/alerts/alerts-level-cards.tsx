import type { AlertsOverview } from "@purosur/contracts";
import type { AlertLevel } from "@purosur/domain";
import { CountCard, localAlertTitle, sortedItems, textOrder } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { ALERT_LEVEL_TONE } from "../platform/alert-level-tone";
import { alertKindLabel } from "./alert-kind-label";

const CountCardLink = createLink(CountCard);

const LEVELS_BY_URGENCY = ["critical", "warning", "informational"] as const satisfies AlertLevel[];

const LEVEL_CARD_LABELS: Record<AlertLevel, string> = {
  critical: "Alertas críticas",
  warning: "Advertencias",
  informational: "Informativas",
};

function kindsDetail(kinds: readonly string[]): string {
  const labels = kinds.map((kind) => localAlertTitle(kind) ?? alertKindLabel(kind));
  return sortedItems(labels, {
    order: textOrder((label) => label),
    direction: "ascending",
  }).join(" · ");
}

export function AlertsLevelCards({ overview }: { overview: AlertsOverview }) {
  return (
    <ul className="grid grid-cols-3 gap-4">
      {LEVELS_BY_URGENCY.map((level) => (
        <li key={level} className="grid">
          <CountCardLink
            to="/alerts"
            search={{ level }}
            label={LEVEL_CARD_LABELS[level]}
            count={overview[level].openCount}
            tone={ALERT_LEVEL_TONE[level]}
            detail={kindsDetail(overview[level].kinds)}
          />
        </li>
      ))}
    </ul>
  );
}
