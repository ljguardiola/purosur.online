import type { ReactNode } from "react";
import type { Icon } from "../shared/icon";
import { type NoticeTone, toneClassName } from "../shared/tone";
import { NoticeFrame } from "./notice-frame";

export type HighlightedNoticeProps = {
  tone: NoticeTone;
  icon: Icon;
  title: string;
  titleAmount?: string | undefined;
  description: string;
  actions?: ReactNode | undefined;
  layout?: "stacked" | "row";
};

export function HighlightedNotice({
  tone,
  icon,
  title,
  titleAmount,
  description,
  actions,
  layout = "stacked",
}: HighlightedNoticeProps) {
  const row = layout === "row";
  const className = [
    "flex w-full rounded-lg p-4",
    row ? "items-center gap-4" : "items-start gap-3",
    row && actions ? "flex-wrap" : undefined,
    toneClassName[tone].surface,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <NoticeFrame
      tone={tone}
      className={className}
      icon={icon}
      iconSize="lg"
      announcement={[title, titleAmount, description]}
      actions={actions}
      actionsPlacement={row ? "end" : "below"}
    >
      <p
        className={
          row ? `text-body font-bold ${toneClassName[tone].strongText}` : "text-subheading"
        }
      >
        {title}
        {titleAmount === undefined ? null : (
          <>
            {" "}
            <span className="whitespace-nowrap">{titleAmount}</span>
          </>
        )}
      </p>
      <p className={row ? "text-detail leading-sm text-text" : "text-detail leading-sm"}>
        {description}
      </p>
    </NoticeFrame>
  );
}
