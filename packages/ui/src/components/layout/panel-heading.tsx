import type { ReactNode } from "react";
import { type Icon, iconSlotClassName } from "../shared/icon";
import { toneClassName } from "../shared/tone";

export type PanelHeadingProps = {
  title: string;
  icon: Icon;
  tone?: "neutral" | "warning";
  children?: ReactNode;
};

export function PanelHeading({ title, icon, tone = "neutral", children }: PanelHeadingProps) {
  return (
    <div className="flex items-center gap-3 px-8 pt-6">
      <span
        aria-hidden="true"
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${tone === "warning" ? toneClassName.warning.surface : "bg-surface-soft text-text"}`}
      >
        <span className={iconSlotClassName.lg}>{icon}</span>
      </span>
      <h2 className="flex-1 text-subheading font-bold text-text">{title}</h2>
      {children}
    </div>
  );
}
