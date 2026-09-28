import type { Icon } from "../shared/icon";
import { iconSlotClassName } from "../shared/icon";
import { type NoticeTone, toneClassName } from "../shared/tone";
import { NoticeFrame } from "./notice-frame";

export type HighlightedNoticeProps = {
  tone: NoticeTone;
  icon: Icon;
  title: string;
  detail: string;
};

export function HighlightedNotice({ tone, icon, title, detail }: HighlightedNoticeProps) {
  const className = [
    "flex w-full items-start gap-3 rounded-lg p-4",
    toneClassName[tone].surface,
  ].join(" ");

  return (
    <NoticeFrame
      tone={tone}
      className={className}
      icon={
        <span aria-hidden="true" className={iconSlotClassName.lg}>
          {icon}
        </span>
      }
      announcement={[title, detail]}
    >
      <p className="text-subheading">{title}</p>
      <p className="text-detail leading-sm">{detail}</p>
    </NoticeFrame>
  );
}
