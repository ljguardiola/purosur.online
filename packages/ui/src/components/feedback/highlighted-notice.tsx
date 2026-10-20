import type { ReactNode } from "react";
import type { Icon } from "../shared/icon";
import { type NoticeTone, toneClassName } from "../shared/tone";
import { NoticeFrame } from "./notice-frame";

export type HighlightedNoticeProps = {
  tone: NoticeTone;
  icon: Icon;
  title: string;
  description: string;
  actions?: ReactNode | undefined;
  layout?: "stacked" | "row";
};

export function HighlightedNotice({
  tone,
  icon,
  title,
  description,
  actions,
  layout = "stacked",
}: HighlightedNoticeProps) {
  const row = layout === "row";
  const className = [
    "flex w-full rounded-lg p-4",
    row ? "items-center gap-4" : "items-start gap-3",
    toneClassName[tone].surface,
  ].join(" ");

  return (
    <NoticeFrame
      tone={tone}
      className={className}
      icon={icon}
      iconSize="lg"
      announcement={[title, description]}
      actions={actions}
      actionsPlacement={row ? "end" : "below"}
    >
      <p
        className={
          row ? `text-body font-bold ${toneClassName[tone].strongText}` : "text-subheading"
        }
      >
        {title}
      </p>
      <p className={row ? "text-detail leading-sm text-text" : "text-detail leading-sm"}>
        {description}
      </p>
    </NoticeFrame>
  );
}
