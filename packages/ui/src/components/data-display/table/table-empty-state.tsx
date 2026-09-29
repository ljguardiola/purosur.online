import { iconSlotClassName } from "../../shared/icon";
import type { TableEmptyStateProps } from "./table-types";

export function TableEmptyState({
  icon,
  title,
  description,
  variant,
  actions,
}: TableEmptyStateProps) {
  const iconColorClassName = variant === "blank" ? "text-text-accent" : "text-text-subtle";

  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <span
        aria-hidden="true"
        className={[
          "flex size-22 shrink-0 items-center justify-center rounded-full bg-surface-subtle",
          iconColorClassName,
        ].join(" ")}
      >
        <span className={iconSlotClassName["4xl"]}>{icon}</span>
      </span>
      <p className="max-w-130 text-title text-text-accent">{title}</p>
      {description ? <p className="max-w-130 text-body text-text-subtle">{description}</p> : null}
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}
