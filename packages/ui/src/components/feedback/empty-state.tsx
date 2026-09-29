import type { ReactNode } from "react";
import { type Icon, iconSlotClassName } from "../shared/icon";

export type EmptyStateVariant = "blank" | "filtered";

export type EmptyStateProps = {
  icon: Icon;
  title: string;
  description?: string;
  variant: EmptyStateVariant;
  actions?: ReactNode;
};

export function EmptyState({ icon, title, description, variant, actions }: EmptyStateProps) {
  const iconColorClassName = variant === "blank" ? "text-text-accent" : "text-text-subtle";

  return (
    <div className="flex flex-col items-center gap-3 px-8 py-6 text-center">
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
