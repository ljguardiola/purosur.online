import { Pill } from "@purosur/ui";
import { Bell } from "lucide-react";
import { openAlertsCountText } from "./open-alerts-count-text";

export function AlertsOpenCountPill({ openCount }: { openCount: number }) {
  if (openCount === 0) {
    return null;
  }
  return (
    <Pill tone="warning" icon={<Bell />}>
      {openAlertsCountText(openCount)}
    </Pill>
  );
}
