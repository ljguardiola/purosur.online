import type { Tone } from "@purosur/ui";
import type { ReactNode } from "react";

const BADGE_CLASS_NAME = {
  info: "bg-info-subtle text-info-strong",
  neutral: "bg-neutral-subtle text-text-subtle",
} as const satisfies Partial<Record<Tone, string>>;

export function StartupPendingRow({
  icon,
  badge,
  title,
  detail,
  trailing,
}: {
  icon: ReactNode;
  badge: keyof typeof BADGE_CLASS_NAME;
  title: string;
  detail: string;
  trailing: ReactNode;
}) {
  return (
    <li className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4">
      <span
        aria-hidden="true"
        className={`flex size-11 shrink-0 items-center justify-center rounded-full ${BADGE_CLASS_NAME[badge]}`}
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-subheading text-text">{title}</p>
        <p className="text-detail text-text-subtle">{detail}</p>
      </div>
      {trailing}
    </li>
  );
}
