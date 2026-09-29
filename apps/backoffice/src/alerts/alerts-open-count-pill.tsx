import { formatNumber, plural } from "@purosur/ui";
import { Bell } from "lucide-react";

export function AlertsOpenCountPill({ openCount }: { openCount: number }) {
  if (openCount === 0) {
    return null;
  }
  return (
    <div className="inline-flex h-7 items-center gap-2 rounded-full bg-warning-subtle px-3 font-sans text-detail font-semibold text-warning-strong">
      <Bell aria-hidden="true" className="size-icon-xs shrink-0" />
      {plural(openCount, {
        one: "1 alerta abierta",
        other: `${formatNumber(openCount)} alertas abiertas`,
      })}
    </div>
  );
}
