import type { Icon } from "../shared/icon";
import { type NoticeTone, toneClassName } from "../shared/tone";
import { NoticeFrame } from "./notice-frame";

export type HighlightedNoticeProps = {
  tone: NoticeTone;
  icon: Icon;
  title: string;
  description: string;
};

export function HighlightedNotice({ tone, icon, title, description }: HighlightedNoticeProps) {
  const className = [
    "flex w-full items-start gap-3 rounded-lg p-4",
    toneClassName[tone].surface,
  ].join(" ");

  return (
    <NoticeFrame
      tone={tone}
      className={className}
      icon={icon}
      iconSize="lg"
      announcement={[title, description]}
    >
      <p className="text-subheading">{title}</p>
      <p className="text-detail leading-sm">{description}</p>
    </NoticeFrame>
  );
}
