import type { ReactNode } from "react";
import { type Icon, iconSlotClassName } from "./icon";

export const cardSurfaceClassName = "w-110 rounded-xl bg-surface shadow-xl";

export function CardTitleRow({
  icon,
  title,
  end,
  gapClassName,
}: {
  icon: Icon;
  title: ReactNode;
  end?: ReactNode;
  gapClassName: "gap-3" | "gap-4";
}) {
  return (
    <div className={`flex shrink-0 items-center ${gapClassName}`}>
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-action-subtle text-text-accent"
      >
        <span className={iconSlotClassName.md}>{icon}</span>
      </span>
      {title}
      {end}
    </div>
  );
}
